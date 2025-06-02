// src/repositories/task.repository.ts
import { Db, Collection, ObjectId, Filter } from 'mongodb';
import { Task, TaskStatus, TaskFilters, TaskType, TaskAgent } from '../models/task';

export type TaskRepository = ReturnType<typeof createTaskRepository>;

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
    if (filters?.taskType) query.taskType = filters.taskType;      // Updated
    if (filters?.taskAgent) query.taskAgent = filters.taskAgent;  // Updated
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
    if (filters?.taskType) query.taskType = filters.taskType;      // Updated
    if (filters?.taskAgent) query.taskAgent = filters.taskAgent;  // Updated
    if (filters?.agentId) query.agentId = filters.agentId;
    
    return collection.countDocuments(query);
  };

  // New helper methods for specific task types
  const findChatTasks = async (
    companyId: string,
    agentId?: string,
    taskAgent?: TaskAgent,
    pagination?: PaginationOptions
  ): Promise<Task[]> => {
    const query: Filter<Task> = { 
      companyId, 
      taskType: 'chat' as TaskType 
    };
    
    if (agentId) query.agentId = agentId;
    if (taskAgent) query.taskAgent = taskAgent;

    return collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(pagination?.skip ?? 0)
      .limit(pagination?.limit ?? 20)
      .toArray();
  };

  const findBroadcastTasks = async (
    companyId: string,
    agentId?: string,
    taskAgent?: TaskAgent,
    pagination?: PaginationOptions
  ): Promise<Task[]> => {
    const query: Filter<Task> = { 
      companyId, 
      taskType: 'broadcast' as TaskType 
    };
    
    if (agentId) query.agentId = agentId;
    if (taskAgent) query.taskAgent = taskAgent;

    return collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(pagination?.skip ?? 0)
      .limit(pagination?.limit ?? 20)
      .toArray();
  };

  const findMailcastTasks = async (
    companyId: string,
    agentId?: string,
    taskAgent?: TaskAgent,
    pagination?: PaginationOptions
  ): Promise<Task[]> => {
    const query: Filter<Task> = { 
      companyId, 
      taskType: 'mailcast' as TaskType 
    };
    
    if (agentId) query.agentId = agentId;
    if (taskAgent) query.taskAgent = taskAgent;

    return collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(pagination?.skip ?? 0)
      .limit(pagination?.limit ?? 20)
      .toArray();
  };

  // Stats method for analytics
  const getTaskStats = async (companyId: string): Promise<{
    total: number;
    byType: Record<TaskType, number>;
    byAgent: Record<TaskAgent, number>;
    byStatus: Record<TaskStatus, number>;
  }> => {
    const pipeline = [
      { $match: { companyId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byType: {
            $push: {
              type: '$taskType',
              agent: '$taskAgent',
              status: '$status',
            }
          }
        }
      }
    ];

    const result = await collection.aggregate(pipeline).toArray();
    
    if (result.length === 0) {
      return {
        total: 0,
        byType: { chat: 0, broadcast: 0, mailcast: 0 },
        byAgent: { DAISI: 0, META: 0 },
        byStatus: { PENDING: 0, PROCESSING: 0, COMPLETED: 0, ERROR: 0 },
      };
    }

    const stats = result[0];
    const byType: Record<TaskType, number> = { chat: 0, broadcast: 0, mailcast: 0 };
    const byAgent: Record<TaskAgent, number> = { DAISI: 0, META: 0 };
    const byStatus: Record<TaskStatus, number> = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, ERROR: 0 };

    // Count by categories
    stats.byType.forEach((item: any) => {
      if (item.type in byType) byType[item.type]++;
      if (item.agent in byAgent) byAgent[item.agent]++;
      if (item.status in byStatus) byStatus[item.status]++;
    });

    return {
      total: stats.total,
      byType,
      byAgent,
      byStatus,
    };
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
    // New methods
    findChatTasks,
    findBroadcastTasks,
    findMailcastTasks,
    getTaskStats,
  };
};