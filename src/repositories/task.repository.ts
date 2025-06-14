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

  const create = async (task: Omit<Task, '_id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
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

  const updateMany = async (
    updates: Array<{
      taskId: string;
      data: Partial<Omit<Task, '_id' | 'createdAt'>>;
    }>
  ): Promise<{ successful: number; failed: number }> => {
    if (updates.length === 0) {
      return { successful: 0, failed: 0 };
    }

    // Filter out invalid task IDs
    const validUpdates = updates.filter(({ taskId }) => ObjectId.isValid(taskId));
    const invalidCount = updates.length - validUpdates.length;

    if (validUpdates.length === 0) {
      return { successful: 0, failed: updates.length };
    }

    // Prepare bulk operations
    const bulkOps = validUpdates.map(({ taskId, data }) => ({
      updateOne: {
        filter: { _id: new ObjectId(taskId) },
        update: {
          $set: {
            ...data,
            updatedAt: new Date(),
          },
        },
      },
    }));

    let result: any;

    try {
      // Execute bulk write with unordered operations (continues on error)
      result = await collection.bulkWrite(bulkOps, { ordered: false });

      return {
        successful: result.modifiedCount,
        failed: invalidCount + (validUpdates.length - result.modifiedCount),
      };
    } catch (err: any) {
      // Handle bulk write errors (partial success)
      if (err.code === 11000 || err.name === 'BulkWriteError') {
        const writeErrors = err.writeErrors || [];
        const successCount = result.matchedCount || 0;

        return {
          successful: successCount,
          failed: invalidCount + writeErrors.length,
        };
      }

      // For other errors, assume all failed
      console.error('[TaskRepository] Bulk update failed:', err);
      return {
        successful: 0,
        failed: updates.length,
      };
    }
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
    if (filters?.taskType) query.taskType = filters.taskType;
    if (filters?.taskAgent) query.taskAgent = filters.taskAgent;
    if (filters?.agentId) query.agentId = filters.agentId;
    if (filters?.label) query.label = filters.label;
    if (filters?.scheduledBefore) {
      query.scheduledAt = { $lte: filters.scheduledBefore };
    }

    return collection
      .find(query)
      .sort({ createdAt: -1, scheduledAt: 1 })
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

  const countByCompany = async (companyId: string, filters?: TaskFilters): Promise<number> => {
    const query: Filter<Task> = { companyId };

    if (filters?.status) query.status = filters.status;
    if (filters?.taskType) query.taskType = filters.taskType;
    if (filters?.taskAgent) query.taskAgent = filters.taskAgent;
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
      taskType: 'chat' as TaskType,
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
      taskType: 'broadcast' as TaskType,
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
      taskType: 'mailcast' as TaskType,
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

  // Fixed stats method with proper aggregation
  const getTaskStats = async (
    companyId: string
  ): Promise<{
    total: number;
    byType: Record<TaskType, number>;
    byAgent: Record<TaskAgent, number>;
    byStatus: Record<TaskStatus, number>;
  }> => {
    // Initialize with default values
    const byType: Record<TaskType, number> = { chat: 0, broadcast: 0, mailcast: 0 };
    const byAgent: Record<TaskAgent, number> = { DAISI: 0, META: 0 };
    const byStatus: Record<TaskStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      ERROR: 0,
    };

    // Get total count
    const total = await collection.countDocuments({ companyId });

    if (total === 0) {
      return { total: 0, byType, byAgent, byStatus };
    }

    // Aggregate by task type
    const typeStats = await collection
      .aggregate([{ $match: { companyId } }, { $group: { _id: '$taskType', count: { $sum: 1 } } }])
      .toArray();

    // Aggregate by task agent
    const agentStats = await collection
      .aggregate([{ $match: { companyId } }, { $group: { _id: '$taskAgent', count: { $sum: 1 } } }])
      .toArray();

    // Aggregate by status
    const statusStats = await collection
      .aggregate([{ $match: { companyId } }, { $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray();

    // Populate results
    typeStats.forEach((item) => {
      if (item._id && item._id in byType) {
        byType[item._id as TaskType] = item.count;
      }
    });

    agentStats.forEach((item) => {
      if (item._id && item._id in byAgent) {
        byAgent[item._id as TaskAgent] = item.count;
      }
    });

    statusStats.forEach((item) => {
      if (item._id && item._id in byStatus) {
        byStatus[item._id as TaskStatus] = item.count;
      }
    });

    return {
      total,
      byType,
      byAgent,
      byStatus,
    };
  };

  return {
    create,
    createMany,
    update,
    updateMany,
    findById,
    findByCompany,
    findScheduledTasks,
    findByBatch,
    countByCompany,
    findChatTasks,
    findBroadcastTasks,
    findMailcastTasks,
    getTaskStats,
  };
};
