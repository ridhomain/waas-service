// src/repositories/task.repository.ts
import { Db, Collection, ObjectId, Filter } from 'mongodb';
import { Task, TaskStatus, TaskChannel } from '../models/task';

export type TaskRepository = ReturnType<typeof createTaskRepository>;

interface TaskFilters {
  status?: TaskStatus;
  channel?: TaskChannel;
  taskType?: string;
  agentId?: string;
  label?: string;
  scheduledBefore?: Date;
}

interface PaginationOptions {
  limit: number;
  skip: number;
}

export const createTaskRepository = (db: Db) => {
  const collection: Collection<Task> = db.collection<Task>('tasks');

  const create = async (
    task: Omit<Task, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> => {
    const now = new Date();
    const result = await collection.insertOne({
      ...task,
      status: task.status ?? 'PENDING',
      createdAt: now,
      updatedAt: now,
    });
    return result.insertedId.toString();
  };

  const createMany = async (
    tasks: Omit<Task, '_id' | 'createdAt' | 'updatedAt'>[]
  ): Promise<string[]> => {
    if (tasks.length === 0) return [];
    
    const now = new Date();
    const docs = tasks.map((t) => ({
      ...t,
      status: t.status ?? 'PENDING',
      createdAt: now,
      updatedAt: now,
    }));
    
    const result = await collection.insertMany(docs);
    return Object.values(result.insertedIds).map((id) => id.toString());
  };

  const update = async (
    taskId: string,
    updates: Partial<Omit<Task, '_id' | 'createdAt'>>
  ): Promise<boolean> => {
    if (!ObjectId.isValid(taskId)) {
      throw new Error('Invalid task ID');
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(taskId) },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );
    
    return result.modifiedCount > 0;
  };

  const findById = async (taskId: string): Promise<Task | null> => {
    if (!ObjectId.isValid(taskId)) {
      return null;
    }
    
    return collection.findOne({ _id: new ObjectId(taskId) });
  };

  const findByCompany = async (
    companyId: string,
    filters?: TaskFilters,
    pagination?: PaginationOptions
  ): Promise<Task[]> => {
    const query: Filter<Task> = { companyId };
    
    if (filters?.status) query.status = filters.status;
    if (filters?.channel) query.channel = filters.channel;
    if (filters?.taskType) query.taskType = filters.taskType;
    if (filters?.agentId) query.agentId = filters.agentId;
    if (filters?.label) query.label = filters.label;
    if (filters?.scheduledBefore) {
      query.scheduledAt = { $lte: filters.scheduledBefore };
    }

    return collection
      .find(query)
      .sort({ scheduledAt: 1, createdAt: -1 })
      .skip(pagination?.skip ?? 0)
      .limit(pagination?.limit ?? 20)
      .toArray();
  };

  const findScheduledTasks = async (
    before: Date,
    status: TaskStatus = 'PENDING'
  ): Promise<Task[]> => {
    return collection
      .find({
        scheduledAt: { $lte: before },
        status,
      })
      .toArray();
  };

  const findByBatch = async (batchId: string): Promise<Task[]> => {
    return collection.find({ batchId }).toArray();
  };

  const countByCompany = async (
    companyId: string,
    filters?: TaskFilters
  ): Promise<number> => {
    const query: Filter<Task> = { companyId };
    
    if (filters?.status) query.status = filters.status;
    if (filters?.channel) query.channel = filters.channel;
    if (filters?.agentId) query.agentId = filters.agentId;
    
    return collection.countDocuments(query);
  };

  return {
    create,
    createMany,
    update,
    findById,
    findByCompany,
    findScheduledTasks,
    findByBatch,
    countByCompany,
  };
};