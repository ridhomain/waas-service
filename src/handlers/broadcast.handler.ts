// src/handlers/broadcast.handler.ts (updated to use new task types)
import { FastifyRequest, FastifyReply } from 'fastify';
import { Agenda } from '@hokify/agenda';
import { TaskRepository } from '../repositories/task.repository';
import { nanoid } from '../utils';
import { forbidden, badRequest, handleError, conflict } from '../utils/errors';
import { sendSuccess, sendError } from '../utils/response';
import { validateMessageType } from '../utils/validators';
import { createDaisiBroadcastTaskPayload } from '../utils/task.utils';
import {
  BroadcastByTagsInput,
  BroadcastPreviewInput,
  CancelBroadcastInput,
  BroadcastStatusInput,
} from '../schemas/zod-schemas';
import { JetStreamClient, StringCodec, headers } from 'nats';
import { TaskAgent } from '../models/task';

export interface BroadcastHandlerDeps {
  taskRepository: TaskRepository;
  agenda: Agenda;
  js: JetStreamClient;
  pg: any;
  publishEvent: (subject: string, data: any) => Promise<void>;
  log: any;
}

interface BroadcastMeta {
  createdBy?: string;
  createdAt: Date;
  scheduledAt: Date;
  totalRecipients: number;
  tags?: string[];
  phones?: string[];
  channel: 'broadcast-by-tags' | 'broadcast-by-phones';
  taskAgent: TaskAgent;  // Added to track which agent system is used
  template?: {
    id?: string;
    name?: string;
    variables?: string[];
  };
}

export const createBroadcastHandlers = (deps: BroadcastHandlerDeps) => {
  const { taskRepository, agenda, js, pg, publishEvent, log } = deps;
  const sc = StringCodec();

  const broadcastByTags = async (
    request: FastifyRequest<{ Body: BroadcastByTagsInput }>,
    reply: FastifyReply
  ) => {
    try {
      const payload = request.body;
      const userCompany = request.user?.company;

      if (payload.companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      // Validate message type
      const validationError = validateMessageType(payload.type, payload.message);
      if (validationError) {
        throw badRequest(validationError, 'INVALID_MESSAGE_TYPE');
      }

      const { agentId, tags, message, schedule, label, userId, variables, options } = payload;
      const batchId = nanoid();
      const scheduledAt = schedule ? new Date(schedule) : new Date();

      // Validate broadcast schedule
      await validateBroadcastSchedule(taskRepository, agentId, scheduledAt);

      // Get contacts from Postgres (excluding groups)
      const contacts = await getContactsByTags({
        pg,
        companySchema: userCompany,
        agentId,
        tags: tags.split(',').map(t => t.trim()),
      });

      if (contacts.length === 0) {
        throw badRequest('No contacts found for the specified tags', 'NO_CONTACTS');
      }

      log.info({ batchId, contactCount: contacts.length, tags }, '[Broadcast] Creating broadcast tasks');

      // Extract variables from message if template-like
      const templateVariables = extractVariableNames(message);

      // Determine task agent (DAISI by default, could be configured per agent/company)
      const taskAgent: TaskAgent = 'DAISI'; // TODO: Make this configurable

      // Store broadcast metadata
      const broadcastMeta: BroadcastMeta = {
        createdBy: userId,
        createdAt: new Date(),
        scheduledAt,
        totalRecipients: contacts.length,
        tags: tags.split(',').map(t => t.trim()),
        channel: 'broadcast-by-tags',
        taskAgent,
        template: templateVariables.length > 0 ? {
          variables: templateVariables
        } : undefined,
      };

      // Create tasks in MongoDB using new task structure
      const tasksToCreate = contacts.map((contact, idx) => 
        createDaisiBroadcastTaskPayload(userCompany, {
          agentId,
          phoneNumber: contact.phone_number,
          message,
          options: options || {},
          variables: variables || {},
          userId,
          label,
          scheduledAt,
          batchId,
          metadata: broadcastMeta
        }, 'broadcast-task')
      );

      const taskIds = await taskRepository.createMany(tasksToCreate);

      // Store active broadcast state in KV
      const kv = await js.views.kv(`broadcast_state`);
      await kv.put(`${agentId}_${batchId}`, sc.encode(JSON.stringify({
        status: 'SCHEDULED',
        batchId,
        agentId,
        companyId: userCompany,
        taskAgent,
        total: contacts.length,
        processed: 0,
        completed: 0,
        failed: 0,
        createdAt: new Date(),
        scheduledAt,
      }))); // 7 days TTL

      // Publish all tasks to stream
      const subject = `v1.broadcasts.${agentId}`;
      const h = headers();
      h.append('Batch-Id', batchId);
      h.append('Agent-Id', agentId);
      h.append('Company', userCompany);

      for (let i = 0; i < taskIds.length; i++) {
        await js.publish(subject, sc.encode(JSON.stringify({
          taskId: taskIds[i],
          batchId,
          phoneNumber: contacts[i].phone_number,
          message,
          options: options || {},
          variables: variables || {},
          label,
          taskAgent,
          // Add contact data for personalization
          contact: {
            name: contacts[i].custom_name || contacts[i].phone_number,
            phone: contacts[i].phone_number,
            // Add more fields as needed for variables
          }
        })), {
          headers: h
        });
      }

      // Schedule or start the broadcast
      const jobData = {
        batchId,
        companyId: userCompany,
        agentId,
        taskAgent,
        total: contacts.length,
      };

      if (schedule) {
        const job = await agenda.schedule(schedule, 'signal-broadcast-start', jobData);

        log.info({ batchId, schedule, total: contacts.length, taskAgent }, '[Broadcast] Scheduled broadcast');

        return sendSuccess(reply, {
          status: 'scheduled' as const,
          batchId,
          total: contacts.length,
          scheduleAt: schedule,
          jobId: job.attrs._id?.toString(),
          taskAgent,
        }, 201);
      }

      // Start immediately
      await agenda.now('signal-broadcast-start', jobData);

      log.info({ batchId, total: contacts.length, taskAgent }, '[Broadcast] Started broadcast');

      return sendSuccess(reply, {
        status: 'started' as const,
        batchId,
        total: contacts.length,
        taskAgent,
      }, 201);
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const previewBroadcast = async (
    request: FastifyRequest<{ Body: BroadcastPreviewInput }>,
    reply: FastifyReply
  ) => {
    try {
      const { companyId, agentId, tags, phones } = request.body;
      const userCompany = request.user?.company;

      if (companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      let contactCount = 0;
      let sampleContacts: any[] = [];

      if (tags) {
        const contacts = await getContactsByTags({
          pg,
          companySchema: userCompany,
          agentId,
          tags: tags.split(',').map(t => t.trim()),
        });
        contactCount = contacts.length;
        sampleContacts = contacts.slice(0, 5).map(c => ({
          phone: c.phone_number,
          name: c.custom_name
        }));
      } else if (phones) {
        const phoneList = phones.split(',')
          .map(p => p.trim())
        const uniquePhones = [...new Set(phoneList)];
        contactCount = uniquePhones.length;
        sampleContacts = uniquePhones.slice(0, 5).map(p => ({ phone: p }));
      }

      // Check active broadcasts
      const activeBroadcasts = await getActiveBroadcasts(taskRepository, agentId);
      const scheduledBroadcasts = await getScheduledBroadcasts(taskRepository, agentId);

      return sendSuccess(reply, {
        contactCount,
        sampleContacts,
        activeBroadcasts: activeBroadcasts.length,
        scheduledBroadcasts: scheduledBroadcasts.length,
        canSchedule: activeBroadcasts.length < 3,
        limits: {
          maxActiveBroadcasts: 3,
          minScheduleGap: '1 week'
        }
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const getBroadcastStatus = async (
    request: FastifyRequest<{ Params: BroadcastStatusInput }>,
    reply: FastifyReply
  ) => {
    try {
      const { batchId } = request.params;
      const userCompany = request.user?.company;

      if (!userCompany) {
        throw forbidden('No company found');
      }

      // Get tasks for this batch
      const tasks = await taskRepository.findByBatch(batchId);
      
      if (tasks.length === 0) {
        throw notFound('Broadcast');
      }

      const firstTask = tasks[0];
      if (firstTask.companyId !== userCompany) {
        throw notFound('Broadcast');
      }

      // Get current state from KV
      const kv = await js.views.kv(`broadcast_state`);
      const stateKey = `${firstTask.agentId}_${batchId}`;
      const state = await kv.get(stateKey);

      // Calculate stats from tasks
      const stats = {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'PENDING').length,
        processing: tasks.filter(t => t.status === 'PROCESSING').length,
        completed: tasks.filter(t => t.status === 'COMPLETED').length,
        failed: tasks.filter(t => t.status === 'ERROR').length,
      };

      const progress = stats.total > 0 
        ? Math.round(((stats.completed + stats.failed) / stats.total) * 100)
        : 0;

      // Parse state if exists
      let broadcastState = {
        status: 'UNKNOWN',
        startedAt: null,
        completedAt: null,
        taskAgent: 'DAISI' as TaskAgent,
      };

      if (state?.value) {
        try {
          broadcastState = JSON.parse(sc.decode(state.value));
        } catch (e) {
          log.error({ error: e, batchId }, 'Failed to parse broadcast state');
        }
      }

      // Get broadcast metadata from first task
      const broadcastMeta = (firstTask as any).broadcastMeta || {};

      const response = {
        batchId,
        agentId: firstTask.agentId,
        label: firstTask.label,
        status: broadcastState.status,
        taskAgent: firstTask.taskAgent,
        scheduledAt: firstTask.scheduledAt,
        startedAt: broadcastState.startedAt,
        completedAt: broadcastState.completedAt,
        createdAt: firstTask.createdAt,
        broadcastMeta,
        stats,
        progress,
      };

      return sendSuccess(reply, response);
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const cancelBroadcast = async (
    request: FastifyRequest<{ Params: CancelBroadcastInput }>,
    reply: FastifyReply
  ) => {
    try {
      const { batchId } = request.params;
      const userCompany = request.user?.company;

      if (!userCompany) {
        throw forbidden('No company found');
      }

      // Verify ownership and get agentId
      const tasks = await taskRepository.findByBatch(batchId);
      if (tasks.length === 0 || tasks[0].companyId !== userCompany) {
        throw notFound('Broadcast');
      }

      const agentId = tasks[0].agentId;
      const taskAgent = tasks[0].taskAgent;

      // Update KV state
      const kv = await js.views.kv(`broadcast_state`);
      const stateKey = `${agentId}_${batchId}`;
      const currentState = await kv.get(stateKey);

      if (currentState?.value) {
        const state = JSON.parse(sc.decode(currentState.value));
        state.status = 'CANCELLED';
        state.cancelledAt = new Date();
        await kv.put(stateKey, sc.encode(JSON.stringify(state)));
      }

      // Cancel scheduled jobs
      const cancelCount = await agenda.cancel({
        'data.batchId': batchId,
        'data.companyId': userCompany,
      });

      // Update pending tasks
      let updatedCount = 0;
      for (const task of tasks) {
        if (task.status === 'PENDING' || task.status === 'PROCESSING') {
          await taskRepository.update(task._id!.toString(), {
            status: 'ERROR',
            errorReason: 'Broadcast cancelled by user',
            finishedAt: new Date(),
          });
          updatedCount++;
        }
      }

      // Send cancel signal to agent
      await publishEvent(`v1.agents.${agentId}`, {
        action: 'CANCEL_BROADCAST',
        batchId,
        taskAgent,
      });

      log.info({ batchId, cancelCount, updatedCount, taskAgent }, '[Broadcast] Cancelled broadcast');

      return sendSuccess(reply, {
        batchId,
        jobsCancelled: cancelCount,
        tasksUpdated: updatedCount,
        taskAgent,
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  return {
    broadcastByTags,
    previewBroadcast,
    getBroadcastStatus,
    cancelBroadcast,
  };
};

// Helper functions
async function getContactsByTags(params: {
  pg: any;
  companySchema: string;
  agentId: string;
  tags: string[];
}): Promise<Array<{ phone_number: string; custom_name?: string }>> {
  const { pg, companySchema, agentId, tags } = params;
  
  // Build tag query with JSONB operators
  const tagConditions = tags.map((_, idx) => `tags @> ${idx + 2}::jsonb`).join(' OR ');
  
  const query = `
    SELECT DISTINCT phone_number, custom_name
    FROM ${companySchema}.contacts 
    WHERE agent_id = $1 
      AND status = 'ACTIVE'
      AND type != 'GROUP'
      AND phone_number NOT LIKE '%@g.us%'
      AND (${tagConditions})
    ORDER BY phone_number
  `;

  const values = [agentId, ...tags.map(tag => JSON.stringify([tag]))];
  
  const result = await pg.query(query, values);
  return result.rows;
}

async function validateBroadcastSchedule(
  taskRepository: TaskRepository,
  agentId: string,
  scheduleDate: Date
): Promise<void> {
  // Check for broadcasts scheduled within 12 hours
  const nearbyBroadcasts = await taskRepository.findByCompany('', {
    agentId,
    taskType: 'broadcast',  // Updated from taskType field
    status: 'PENDING',
    scheduledBefore: new Date(scheduleDate.getTime() + 7* 24 * 60 * 60 * 1000),
  }, { limit: 10, skip: 0 });

  const conflictingBroadcasts = nearbyBroadcasts.filter(task => {
    if (!task.scheduledAt) return false;
    const timeDiff = Math.abs(task.scheduledAt.getTime() - scheduleDate.getTime());
    return timeDiff <= 7* 24 * 60 * 60 * 1000; // 7 days
  });

  if (conflictingBroadcasts.length > 0) {
    throw conflict('Another broadcast is scheduled within 12 hours', 'SCHEDULE_CONFLICT', {
      conflicts: conflictingBroadcasts.map(t => ({
        batchId: t.batchId,
        scheduledAt: t.scheduledAt
      }))
    });
  }

  // Check max active broadcasts
  const activeBroadcasts = await getActiveBroadcasts(taskRepository, agentId);
  
  if (activeBroadcasts.length >= 3) {
    throw conflict('Maximum 3 active broadcasts allowed per agent', 'MAX_BROADCASTS');
  }
}

async function getActiveBroadcasts(taskRepository: TaskRepository, agentId: string) {
  const activeTasks = await taskRepository.findByCompany('', {
    agentId,
    taskType: 'broadcast',  // Updated from taskType field
    status: 'PROCESSING',
  }, { limit: 100, skip: 0 });

  // Group by batch and return unique batches
  const batches = [...new Set(activeTasks.map(t => t.batchId))];
  return batches;
}

async function getScheduledBroadcasts(taskRepository: TaskRepository, agentId: string) {
  const scheduledTasks = await taskRepository.findByCompany('', {
    agentId,
    taskType: 'broadcast',  // Updated from taskType field
    status: 'PENDING',
    scheduledBefore: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
  }, { limit: 100, skip: 0 });

  const batches = [...new Set(scheduledTasks.map(t => t.batchId))];
  return batches;
}

function extractVariableNames(message: any): string[] {
  const variables = new Set<string>();
  const pattern = /\{\{(\w+)\}\}/g;
  
  // Check text content
  if (message.text) {
    const matches = message.text.matchAll(pattern);
    for (const match of matches) {
      variables.add(match[1]);
    }
  }
  
  // Check caption for images/documents
  if (message.caption) {
    const matches = message.caption.matchAll(pattern);
    for (const match of matches) {
      variables.add(match[1]);
    }
  }
  
  return Array.from(variables);
}

function notFound(resource: string): never {
  throw badRequest(`${resource} not found`, 'NOT_FOUND');
}