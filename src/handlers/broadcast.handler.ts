// src/handlers/broadcast.handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { Agenda } from '@hokify/agenda';
import { TaskRepository } from '../repositories/task.repository';
import { nanoid } from '../utils';
import { forbidden, badRequest, handleError, conflict } from '../utils/errors';
import { sendSuccess, sendError } from '../utils/response';
import { createDaisiBroadcastTaskPayload } from '../utils/task.utils';
import {
  BroadcastByTagsInput,
  BroadcastPreviewInput,
  CancelBroadcastInput,
  BroadcastStatusInput,
} from '../schemas/zod-schemas';
import { JetStreamClient, StringCodec } from 'nats';
import { TaskAgent } from '../models/task';
import {
  BroadcastStatus,
  BroadcastState,
  createBroadcastState,
  transitionBroadcastStatus,
  deriveBroadcastStatus,
  getBroadcastSummary,
} from '../utils/broadcast.utils';

export interface BroadcastHandlerDeps {
  taskRepository: TaskRepository;
  agenda: Agenda;
  js: JetStreamClient;
  pg: any;
  log: any;
}

export const createBroadcastHandlers = (deps: BroadcastHandlerDeps) => {
  const { taskRepository, agenda, js, pg, log } = deps;
  const sc = StringCodec();

  const broadcastByTags = async (
    request: FastifyRequest<{ Body: BroadcastByTagsInput }>,
    reply: FastifyReply
  ) => {
    try {
      const payload = request.body;
      const userCompany = request.user?.company;

      if (!userCompany) {
        throw forbidden('No company found');
      }

      if (payload.companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      const { agentId, tags, message, scheduleAt, label, userId, variables, options } = payload;
      const batchId = nanoid();
      const scheduledAt = new Date(scheduleAt);

      // Validate broadcast schedule
      await validateBroadcastSchedule(taskRepository, agentId, scheduledAt);

      // Get contacts from Postgres
      const contacts = await getContactsByTags({
        pg,
        companyId: userCompany,
        agentId,
        tags: tags.split(',').map((t) => t.trim()),
      });

      if (contacts.length === 0) {
        throw badRequest('No contacts found for the specified tags', 'NO_CONTACTS');
      }

      log.info(
        { batchId, contactCount: contacts.length, tags },
        '[Broadcast] Creating broadcast tasks'
      );

      // Extract variables from message if template-like
      const templateVariables = extractVariableNames(message);

      // Determine task agent
      const taskAgent: TaskAgent = 'DAISI';

      // Create initial broadcast state
      const broadcastState = createBroadcastState({
        batchId,
        agentId,
        companyId: userCompany,
        taskAgent,
        total: contacts.length,
        scheduledAt,
        metadata: {
          createdBy: userId,
          tags: tags.split(',').map((t) => t.trim()),
          channel: 'broadcast-by-tags',
          label,
          template:
            templateVariables.length > 0
              ? {
                  variables: templateVariables,
                }
              : undefined,
        },
      });

      // Store broadcast state in KV
      const kv = await js.views.kv('broadcast_state');
      await kv.put(`${agentId}.${batchId}`, sc.encode(JSON.stringify(broadcastState)));

      // Create tasks in MongoDB
      const tasksToCreate = contacts.map((contact) =>
        createDaisiBroadcastTaskPayload(
          userCompany,
          {
            agentId,
            phoneNumber: contact.phone_number,
            message,
            options: options || {},
            variables: variables || {},
            userId,
            label,
            scheduledAt: scheduledAt,
            batchId,
            metadata: broadcastState.metadata,
          },
          'broadcast-task'
        )
      );

      await taskRepository.createMany(tasksToCreate);

      // Schedule the broadcast start
      const jobData = {
        batchId,
        companyId: userCompany,
        agentId,
        taskAgent,
        total: contacts.length,
      };

      const job = await agenda.schedule(scheduledAt, 'signal-broadcast-start', jobData);

      log.info(
        { batchId, scheduledAt, total: contacts.length, taskAgent },
        '[Broadcast] Scheduled broadcast'
      );

      return sendSuccess(
        reply,
        {
          status: 'scheduled' as const,
          broadcastStatus: 'SCHEDULED' as BroadcastStatus,
          batchId,
          total: contacts.length,
          scheduleAt: scheduledAt.toISOString(),
          jobId: job.attrs._id?.toString(),
          taskAgent,
        },
        201
      );
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

      if (!userCompany) {
        throw forbidden('No company found');
      }

      if (companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      let contactCount = 0;
      let sampleContacts: any[] = [];

      if (tags) {
        const contacts = await getContactsByTags({
          pg,
          companyId: userCompany,
          agentId,
          tags: tags.split(',').map((t) => t.trim()),
        });
        contactCount = contacts.length;
        sampleContacts = contacts.slice(0, 5).map((c) => ({
          phone: c.phone_number,
        }));
      } else if (phones) {
        const phoneList = phones.split(',').map((p) => p.trim());
        const uniquePhones = [...new Set(phoneList)];
        contactCount = uniquePhones.length;
        sampleContacts = uniquePhones.slice(0, 5).map((p) => ({ phone: p }));
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
          minScheduleGap: '1 week',
        },
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
      const kv = await js.views.kv('broadcast_state');
      const stateKey = `${firstTask.agentId}.${batchId}`; // Changed from _ to .
      const stateEntry = await kv.get(stateKey);

      let broadcastState: BroadcastState | null = null;
      if (stateEntry?.value) {
        broadcastState = JSON.parse(sc.decode(stateEntry.value));
      }

      // Calculate stats from tasks
      const stats = {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === 'PENDING').length,
        processing: tasks.filter((t) => t.status === 'PROCESSING').length,
        completed: tasks.filter((t) => t.status === 'COMPLETED').length,
        failed: tasks.filter((t) => t.status === 'ERROR').length,
      };

      // Update broadcast state with actual counts if exists
      if (broadcastState) {
        // Sync the counts from actual task data
        broadcastState.completed = stats.completed;
        broadcastState.failed = stats.failed;
        broadcastState.processed = stats.completed + stats.failed;

        // Derive the status based on actual progress
        const derivedStatus = deriveBroadcastStatus(broadcastState);

        // Only update status if it's not user-controlled
        if (!['PAUSED', 'CANCELLED'].includes(broadcastState.status)) {
          broadcastState.status = derivedStatus;
        }
      }

      // Get broadcast summary
      const summary = broadcastState ? getBroadcastSummary(broadcastState) : null;

      const response = {
        batchId,
        agentId: firstTask.agentId,
        label: firstTask.label,
        status: summary?.status || 'UNKNOWN',
        taskAgent: firstTask.taskAgent,
        scheduledAt: firstTask.scheduledAt,
        startedAt: broadcastState?.startedAt,
        pausedAt: broadcastState?.pausedAt,
        resumedAt: broadcastState?.resumedAt,
        completedAt: broadcastState?.completedAt,
        cancelledAt: broadcastState?.cancelledAt,
        createdAt: firstTask.createdAt,
        pauseReason: broadcastState?.pauseReason,
        broadcastMeta: broadcastState?.metadata || {},
        stats,
        progress: summary?.progress || 0,
        successRate: summary?.successRate || 0,
        failureRate: summary?.failureRate || 0,
        isComplete: summary?.isComplete || false,
        isTerminal: summary?.isTerminal || false,
        canResume: summary?.canResume || false,
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

      // Transition to CANCELLED status
      const kv = await js.views.kv('broadcast_state');
      const transitionResult = await transitionBroadcastStatus(kv, agentId, batchId, 'CANCELLED');

      if (!transitionResult.success) {
        throw conflict(transitionResult.error || 'Cannot cancel broadcast', 'INVALID_TRANSITION');
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

      log.info(
        { batchId, cancelCount, updatedCount, taskAgent },
        '[Broadcast] Cancelled broadcast'
      );

      return sendSuccess(reply, {
        batchId,
        jobsCancelled: cancelCount,
        tasksUpdated: updatedCount,
        taskAgent,
        broadcastStatus: 'CANCELLED' as BroadcastStatus,
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const pauseBroadcast = async (
    request: FastifyRequest<{ Params: { batchId: string } }>,
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

      const kv = await js.views.kv('broadcast_state');
      const transitionResult = await transitionBroadcastStatus(kv, agentId, batchId, 'PAUSED', {
        pauseReason: 'USER_REQUESTED',
      });

      if (!transitionResult.success) {
        throw conflict(transitionResult.error || 'Cannot pause broadcast', 'INVALID_TRANSITION');
      }

      log.info({ batchId, agentId }, '[Broadcast] Paused broadcast');

      return sendSuccess(reply, {
        batchId,
        broadcastStatus: 'PAUSED' as BroadcastStatus,
        pausedAt: transitionResult.state?.pausedAt,
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const resumeBroadcast = async (
    request: FastifyRequest<{ Params: { batchId: string } }>,
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

      const kv = await js.views.kv('broadcast_state');

      // Direct transition from PAUSED to PROCESSING
      const transitionResult = await transitionBroadcastStatus(kv, agentId, batchId, 'PROCESSING');

      if (!transitionResult.success) {
        throw conflict(transitionResult.error || 'Cannot resume broadcast', 'INVALID_TRANSITION');
      }

      log.info({ batchId, agentId }, '[Broadcast] Resumed broadcast');

      return sendSuccess(reply, {
        batchId,
        broadcastStatus: 'PROCESSING' as BroadcastStatus,
        resumedAt: transitionResult.state?.resumedAt,
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
    pauseBroadcast,
    resumeBroadcast,
  };
};

// Helper functions
async function getContactsByTags(params: {
  pg: any;
  companyId: string;
  agentId: string;
  tags: string[];
}): Promise<Array<{ phone_number: string }>> {
  const { pg, companyId, agentId, tags } = params;

  const schemaName = `daisi_${companyId.toLowerCase()}`;
  const tableName = `"${schemaName}"."contacts"`;

  const query = `
    SELECT DISTINCT phone_number
    FROM ${tableName}
    WHERE agent_id = $1
    AND string_to_array(tags, ',') && $2::text[]
    AND LENGTH(phone_number) >= 10
    AND LENGTH(phone_number) <= 15
    ORDER BY phone_number
  `;

  const values = [agentId, tags];

  const result = await pg.query(query, values);
  return result.rows;
}

async function validateBroadcastSchedule(
  taskRepository: TaskRepository,
  agentId: string,
  scheduleDate: Date
): Promise<void> {
  // Check for broadcasts scheduled within 7 days
  const nearbyBroadcasts = await taskRepository.findByCompany(
    '',
    {
      agentId,
      taskType: 'broadcast',
      status: 'PENDING',
      scheduledBefore: new Date(scheduleDate.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
    { limit: 10, skip: 0 }
  );

  const conflictingBroadcasts = nearbyBroadcasts.filter((task) => {
    if (!task.scheduledAt) return false;
    const timeDiff = Math.abs(task.scheduledAt.getTime() - scheduleDate.getTime());
    return timeDiff <= 7 * 24 * 60 * 60 * 1000; // 7 days
  });

  if (conflictingBroadcasts.length > 0) {
    throw conflict('Another broadcast is scheduled within 7 days', 'SCHEDULE_CONFLICT', {
      conflicts: conflictingBroadcasts.map((t) => ({
        batchId: t.batchId,
        scheduledAt: t.scheduledAt,
      })),
    });
  }

  // Check max active broadcasts
  const activeBroadcasts = await getActiveBroadcasts(taskRepository, agentId);

  if (activeBroadcasts.length >= 3) {
    throw conflict('Maximum 3 active broadcasts allowed per agent', 'MAX_BROADCASTS');
  }
}

async function getActiveBroadcasts(taskRepository: TaskRepository, agentId: string) {
  const activeTasks = await taskRepository.findByCompany(
    '',
    {
      agentId,
      taskType: 'broadcast',
      status: 'PROCESSING',
    },
    { limit: 100, skip: 0 }
  );

  // Group by batch and return unique batches
  const batches = [...new Set(activeTasks.map((t) => t.batchId).filter(Boolean))];
  return batches;
}

async function getScheduledBroadcasts(taskRepository: TaskRepository, agentId: string) {
  const scheduledTasks = await taskRepository.findByCompany(
    '',
    {
      agentId,
      taskType: 'broadcast',
      status: 'PENDING',
      scheduledBefore: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
    },
    { limit: 100, skip: 0 }
  );

  const batches = [...new Set(scheduledTasks.map((t) => t.batchId).filter(Boolean))];
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
