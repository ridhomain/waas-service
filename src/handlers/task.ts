// handlers/task.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { ObjectId } from 'mongodb';
import { Task, TaskChannel, TaskStatus, TaskType } from '../models/task';

// GET /tasks
export async function listTasks(request: FastifyRequest, reply: FastifyReply) {
  const {
    status,
    channel,
    type,
    label,
    agentId,
    limit = 20,
    skip = 0,
    scheduledBefore,
  } = request.query as {
    status?: TaskStatus;
    channel?: TaskChannel;
    type?: TaskType;
    label?: string;
    agentId?: string;
    scheduledBefore?: string;
    limit?: number;
    skip?: number;
  };

  const companyId = request.user?.company;
  if (!companyId) {
    return reply.status(401).send({ error: 'Unauthorized: no company ID' });
  }

  const filter: Record<string, any> = { companyId };

  if (status) filter.status = status;
  if (channel) filter.channel = channel;
  if (type) filter.taskType = type;
  if (label) filter.label = label;
  if (agentId) filter.agentId = agentId;
  if (scheduledBefore) {
    filter.scheduledAt = { $lte: new Date(scheduledBefore) };
  }

  const tasks = await request.server.taskService.collection
    .find(filter)
    .sort({ scheduledAt: 1, createdAt: -1 })
    .skip(Number(skip))
    .limit(Number(limit))
    .toArray();

  return reply.send(tasks.map((task: any) => ({
    ...task,
    id: task._id?.toString(),
    _id: undefined,
  })));
}

// GET /tasks/:id
export async function getTaskById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  if (!ObjectId.isValid(id)) {
    return reply.status(400).send({ error: 'Invalid task ID' });
  }

  const task = await request.server.taskService.getById(id);

  if (!task) {
    return reply.status(404).send({ error: 'Task not found' });
  }

  return reply.send({
    ...task,
    id: task._id?.toString(),
    _id: undefined,
  });
}

// PATCH /tasks/:id — optional, unused by default
export async function patchTaskById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const payload = request.body as Partial<Pick<Task, 'status' | 'label'>>;

  if (!ObjectId.isValid(id)) {
    return reply.status(400).send({ error: 'Invalid task ID' });
  }

  const update: any = {};
  if (payload.status) update.status = payload.status;
  if (payload.label) update.label = payload.label;

  if (Object.keys(update).length === 0) {
    return reply.status(400).send({ error: 'No fields to update' });
  }

  update.updatedAt = new Date();

  const result = await request.server.taskService.collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: update }
  );

  if (result.matchedCount === 0) {
    return reply.status(404).send({ error: 'Task not found' });
  }

  return reply.send({ success: true, id });
}