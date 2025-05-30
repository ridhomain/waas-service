import { Db } from 'mongodb';
import { Task } from '../models/task';

export class TaskService {
  private readonly collection;

  constructor(private readonly db: Db) {
    this.collection = this.db.collection<Task>('tasks');
  }

  async create(task: Omit<Task, '_id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = new Date();
    const result = await this.collection.insertOne({
      ...task,
      status: task.status ?? 'PENDING',
      createdAt: now,
      updatedAt: now,
    });
    return result.insertedId.toString();
  }

  async createMany(tasks: Omit<Task, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const now = new Date();
    const docs = tasks.map((t) => ({
      ...t,
      status: t.status ?? 'PENDING',
      createdAt: now,
      updatedAt: now,
    }));
    const result = await this.collection.insertMany(docs);
    return Object.values(result.insertedIds).map((id) => id.toString());
  }

  async update(taskId: string, updates: Partial<Pick<Task, "agendaJobId" | "jobName" | "status" | "updatedAt">>) {
    await this.collection.updateOne(
      { _id: taskId },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );
  }

  async getById(taskId: string): Promise<Task | null> {
    return this.collection.findOne({ _id: taskId });
  }

  async getByBatch(batchId: string): Promise<Task[]> {
    return this.collection.find({ batchId }).toArray();
  }

  // Optional: filter by agent, company, status, etc.
  async getByCompany(companyId: string): Promise<Task[]> {
    return this.collection.find({ companyId }).toArray();
  }

  async getScheduledBefore(date: Date): Promise<Task[]> {
    return this.collection.find({
      scheduledAt: { $lte: date },
      status: 'PENDING',
    }).toArray();
  }
}
