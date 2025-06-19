// src/handlers/multi-agent-broadcast.handler.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { Agenda } from '@hokify/agenda';
import { TaskRepository } from '../repositories/task.repository';
import { nanoid } from '../utils';
import { forbidden, badRequest, handleError, conflict } from '../utils/errors';
import { sendSuccess, sendError } from '../utils/response';
import { createDaisiBroadcastTaskPayload } from '../utils/task.utils';
import { MultiAgentBroadcastInput, MultiAgentBroadcastPreviewInput } from '../schemas/zod-schemas';
import { JetStreamClient, StringCodec } from 'nats';
import { createBroadcastState } from '../utils/broadcast.utils';

export interface MultiAgentBroadcastHandlerDeps {
  taskRepository: TaskRepository;
  agenda: Agenda;
  js: JetStreamClient;
  pg: any;
  publishEvent: (subject: string, data: any) => Promise<void>;
  log: any;
}

interface ContactRecord {
  phone_number: string;
  agent_id: string;
}

interface AgentValidation {
  agentId: string;
  canBroadcast: boolean;
  reason?: string;
  activeBroadcasts: number;
  scheduledBroadcasts: number;
  nearbyBroadcasts?: Array<{ batchId: string; scheduledAt: Date }>;
}

export const createMultiAgentBroadcastHandlers = (deps: MultiAgentBroadcastHandlerDeps) => {
  const { taskRepository, agenda, js, pg, log } = deps;
  const sc = StringCodec();

  const createMultiAgentBroadcast = async (
    request: FastifyRequest<{ Body: MultiAgentBroadcastInput }>,
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

      const { agents, tags, message, label, userId, variables, options } = payload;

      // Validate no duplicate agents
      const agentIds = agents.map((a) => a.agentId);
      const uniqueAgentIds = new Set(agentIds);
      if (agentIds.length !== uniqueAgentIds.size) {
        throw badRequest(
          'Duplicate agent IDs found. Each agent can only appear once.',
          'DUPLICATE_AGENTS'
        );
      }

      // Validate all agents' broadcast capacity
      const validations = await validateAllAgentsBroadcastCapacity(taskRepository, agents);

      // Check if any agent cannot broadcast
      const failedValidations = validations.filter((v) => !v.canBroadcast);
      if (failedValidations.length > 0) {
        const reasons = failedValidations.map(
          (v) =>
            `${v.agentId}: ${v.reason} (active: ${v.activeBroadcasts}, scheduled: ${v.scheduledBroadcasts})`
        );
        throw conflict(
          `Cannot create multi-agent broadcast. The following agents have reached their limits:\n${reasons.join('\n')}`,
          'BROADCAST_LIMIT_EXCEEDED',
          { validations }
        );
      }

      // Process each agent independently
      const results = [];
      const tagList = tags.split(',').map((t) => t.trim());

      // Batch query contacts for all agents to reduce DB calls
      const allAgentContacts = await getContactsForMultipleAgents({
        pg,
        companyId: userCompany,
        agentIds,
        tags: tagList,
      });

      for (const agent of agents) {
        const { agentId, scheduleAt } = agent;

        // Get contacts for this specific agent from the batch query
        const contacts = allAgentContacts.get(agentId) || [];

        if (contacts.length === 0) {
          log.info(
            { agentId, tags: tagList },
            '[Multi-Broadcast] No contacts found for agent, skipping'
          );
          continue;
        }

        const scheduledAt = new Date(scheduleAt);

        // Validate schedule is in the future
        if (scheduledAt <= new Date()) {
          throw badRequest(
            `Schedule for agent ${agentId} must be in the future`,
            'INVALID_SCHEDULE'
          );
        }

        // Create a separate broadcast for this agent
        const batchId = nanoid();

        // Create broadcast state
        const broadcastState = createBroadcastState({
          batchId,
          agentId,
          companyId: userCompany,
          taskAgent: 'DAISI',
          total: contacts.length,
          scheduledAt,
          metadata: {
            createdBy: userId,
            tags: tagList,
            channel: 'multi-agent-broadcast',
            label, // Label for grouping/searching
          },
        });

        // Store broadcast state
        const kv = await js.views.kv('broadcast_state');
        await kv.put(`${agentId}.${batchId}`, sc.encode(JSON.stringify(broadcastState)));

        // Create tasks for this agent's contacts
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
              scheduledAt,
              batchId,
              metadata: broadcastState.metadata,
            },
            'multi-agent-broadcast-task'
          )
        );

        await taskRepository.createMany(tasksToCreate);

        // Schedule broadcast
        const jobData = {
          batchId,
          companyId: userCompany,
          agentId,
          taskAgent: 'DAISI',
          total: contacts.length,
        };

        const job = await agenda.schedule(scheduledAt, 'signal-broadcast-start', jobData);

        results.push({
          agentId,
          batchId,
          contactCount: contacts.length,
          scheduleAt: scheduledAt.toISOString(),
          status: 'SCHEDULED',
          jobId: job.attrs._id?.toString(),
        });

        log.info(
          { agentId, batchId, contactCount: contacts.length, schedule: scheduledAt },
          '[Multi-Broadcast] Created broadcast for agent'
        );
      }

      if (results.length === 0) {
        throw badRequest(
          'No broadcasts could be created. No contacts found for any agent with the specified tags.',
          'NO_BROADCASTS_CREATED'
        );
      }

      // Calculate totals
      const totalContacts = results.reduce((sum, r) => sum + r.contactCount, 0);

      return sendSuccess(
        reply,
        {
          status: 'scheduled',
          label,
          tags: tagList,
          broadcasts: results,
          summary: {
            totalContacts,
            totalAgents: results.length,
            skippedAgents: agents.length - results.length,
          },
        },
        201
      );
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  const previewMultiAgentBroadcast = async (
    request: FastifyRequest<{ Body: MultiAgentBroadcastPreviewInput }>,
    reply: FastifyReply
  ) => {
    try {
      const { companyId, agents, tags } = request.body;
      const userCompany = request.user?.company;

      if (!userCompany) {
        throw forbidden('No company found');
      }

      if (companyId !== userCompany) {
        throw forbidden('Unauthorized company access');
      }

      // Validate no duplicate agents
      const agentIds = agents.map((a) => a.agentId);
      const uniqueAgentIds = new Set(agentIds);
      if (agentIds.length !== uniqueAgentIds.size) {
        throw badRequest('Duplicate agent IDs found', 'DUPLICATE_AGENTS');
      }

      const tagList = tags.split(',').map((t) => t.trim());

      // Get contact counts for all agents efficiently
      const contactCounts = await getContactCountsForAgents({
        pg,
        companyId: userCompany,
        agentIds,
        tags: tagList,
      });

      // Validate broadcast capacity for all agents
      const validations = await validateAllAgentsBroadcastCapacity(taskRepository, agents);

      // Build preview for each agent
      const agentPreviews = agents.map((agent) => {
        const validation = validations.find((v) => v.agentId === agent.agentId)!;
        const contactCount = contactCounts.get(agent.agentId) || 0;

        return {
          agentId: agent.agentId,
          scheduleAt: agent.scheduleAt,
          contactCount,
          canBroadcast: validation.canBroadcast,
          reason: validation.reason,
          activeBroadcasts: validation.activeBroadcasts,
          scheduledBroadcasts: validation.scheduledBroadcasts,
          limits: {
            maxActiveBroadcasts: 3,
            minScheduleGap: '1 week',
          },
        };
      });

      const totalContacts = Array.from(contactCounts.values()).reduce(
        (sum, count) => sum + count,
        0
      );
      const canProceed = agentPreviews.every((p) => p.canBroadcast && p.contactCount > 0);

      return sendSuccess(reply, {
        canProceed,
        tags: tagList,
        agents: agentPreviews,
        summary: {
          totalContacts,
          totalAgents: agents.length,
          agentsWithContacts: agentPreviews.filter((p) => p.contactCount > 0).length,
          agentsAtLimit: agentPreviews.filter((p) => !p.canBroadcast).length,
        },
      });
    } catch (error) {
      const appError = handleError(error);
      return sendError(reply, appError);
    }
  };

  return {
    createMultiAgentBroadcast,
    previewMultiAgentBroadcast,
  };
};

// Helper functions
// Batch query contacts for multiple agents to reduce DB calls
async function getContactsForMultipleAgents(params: {
  pg: any;
  companyId: string;
  agentIds: string[];
  tags: string[];
}): Promise<Map<string, ContactRecord[]>> {
  const { pg, companyId, agentIds, tags } = params;

  const schemaName = `daisi_${companyId.toLowerCase()}`;
  const tableName = `"${schemaName}"."contacts"`;

  // Query all contacts at once, grouped by agent
  const query = `
    SELECT DISTINCT
      phone_number,
      agent_id
    FROM ${tableName}
    WHERE agent_id = ANY($1::text[])
      AND string_to_array(tags, ',') && $2::text[]
      AND LENGTH(phone_number) >= 10
      AND LENGTH(phone_number) <= 15
    ORDER BY agent_id, phone_number
  `;

  const values = [agentIds, tags];
  const result = await pg.query(query, values);

  // Group contacts by agent
  const contactsByAgent = new Map<string, ContactRecord[]>();

  for (const row of result.rows) {
    if (!contactsByAgent.has(row.agent_id)) {
      contactsByAgent.set(row.agent_id, []);
    }
    contactsByAgent.get(row.agent_id)!.push(row);
  }

  return contactsByAgent;
}

// Get contact counts efficiently without fetching all data
async function getContactCountsForAgents(params: {
  pg: any;
  companyId: string;
  agentIds: string[];
  tags: string[];
}): Promise<Map<string, number>> {
  const { pg, companyId, agentIds, tags } = params;

  const schemaName = `daisi_${companyId.toLowerCase()}`;
  const tableName = `"${schemaName}"."contacts"`;

  // Query counts grouped by agent
  const query = `
    SELECT 
      agent_id,
      COUNT(DISTINCT phone_number) as contact_count
    FROM ${tableName}
    WHERE agent_id = ANY($1::text[])
      AND string_to_array(tags, ',') && $2::text[]
      AND LENGTH(phone_number) >= 10
      AND LENGTH(phone_number) <= 15
    GROUP BY agent_id
  `;

  const values = [agentIds, tags];
  const result = await pg.query(query, values);

  const counts = new Map<string, number>();
  for (const row of result.rows) {
    counts.set(row.agent_id, parseInt(row.contact_count));
  }

  return counts;
}

// Validate broadcast capacity for all agents
async function validateAllAgentsBroadcastCapacity(
  taskRepository: TaskRepository,
  agents: Array<{ agentId: string; scheduleAt: string }>
): Promise<AgentValidation[]> {
  const validations: AgentValidation[] = [];

  for (const agent of agents) {
    const validation = await validateAgentBroadcastCapacity(
      taskRepository,
      agent.agentId,
      new Date(agent.scheduleAt)
    );
    validations.push(validation);
  }

  return validations;
}

// Validate single agent broadcast capacity
async function validateAgentBroadcastCapacity(
  taskRepository: TaskRepository,
  agentId: string,
  scheduleDate: Date
): Promise<AgentValidation> {
  // Get active broadcasts (currently processing)
  const activeTasks = await taskRepository.findByCompany(
    '',
    {
      agentId,
      taskType: 'broadcast',
      status: 'PROCESSING',
    },
    { limit: 100, skip: 0 }
  );

  const activeBroadcasts = [...new Set(activeTasks.map((t) => t.batchId).filter(Boolean))];

  // Get scheduled broadcasts
  const oneWeekFromSchedule = new Date(scheduleDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const scheduledTasks = await taskRepository.findByCompany(
    '',
    {
      agentId,
      taskType: 'broadcast',
      status: 'PENDING',
      scheduledBefore: oneWeekFromSchedule,
    },
    { limit: 100, skip: 0 }
  );

  const scheduledBroadcastsMap = new Map<string, Date>();
  scheduledTasks.forEach((task) => {
    if (task.batchId && task.scheduledAt) {
      scheduledBroadcastsMap.set(task.batchId, task.scheduledAt);
    }
  });

  // Check for broadcasts within 1 week of the proposed schedule
  const nearbyBroadcasts: Array<{ batchId: string; scheduledAt: Date }> = [];
  const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;

  for (const [batchId, scheduledAt] of scheduledBroadcastsMap.entries()) {
    const timeDiff = Math.abs(scheduledAt.getTime() - scheduleDate.getTime());
    if (timeDiff <= oneWeekInMs) {
      nearbyBroadcasts.push({ batchId, scheduledAt });
    }
  }

  // Determine if agent can broadcast
  let canBroadcast = true;
  let reason = '';

  if (activeBroadcasts.length >= 3) {
    canBroadcast = false;
    reason = 'Maximum 3 active broadcasts allowed';
  } else if (nearbyBroadcasts.length > 0) {
    canBroadcast = false;
    const nearestDate = nearbyBroadcasts[0].scheduledAt.toISOString();
    reason = `Another broadcast scheduled within 7 days at ${nearestDate}`;
  }

  return {
    agentId,
    canBroadcast,
    reason: reason || undefined,
    activeBroadcasts: activeBroadcasts.length,
    scheduledBroadcasts: scheduledBroadcastsMap.size,
    nearbyBroadcasts: nearbyBroadcasts.length > 0 ? nearbyBroadcasts : undefined,
  };
}
