import { FastifyInstance } from 'fastify';
import { SendCommandPayload, TestNotificationPayload, StandardResponse } from '../types/command.js';

export async function sendCommand(
  fastify: FastifyInstance,
  company: string,
  payload: SendCommandPayload
): Promise<StandardResponse<{ msgId?: string }>> {
  const db = fastify.mongo.db;
  const { action, sender, batchId } = payload;

  try {
    const task = await db?.collection('tasks').findOne({ batch: batchId, sender, company });

    if (!task) {
      fastify.log.warn(`No tasks found for batch: ${batchId}`);
      return { success: false, error: `No tasks found for batch ${batchId}` };
    }

    const broadcastStreamName = `BROADCAST:${company}:${sender}:${batchId}`;
    const currentLen = await fastify.redis.client.xlen(broadcastStreamName);

    if (currentLen === 0) {
      fastify.log.error(
        `Stream ${broadcastStreamName} is empty (len=${currentLen}), canceling the command.`
      );
      return {
        success: false,
        error: 'Cannot send the command. No broadcast stream found',
      };
    }

    const streamName = `WORKER:${company}:${sender}`;

    const message = {
      action,
      taskObj: {
        msg: task.msg,
        variables: task.variables,
        batchId: task.batch,
        label: task.label,
      },
    };

    // const msgId = await fastify.redis.pubToStream(streamName, message);

    // return { success: true, data: { msgId } };
    return { success: true, data: { msgId: 'ok' } };
  } catch (error: any) {
    fastify.log.error('Send command failed:', error);
    return { success: false, error: error.message };
  }
}

export async function testNotification(
  fastify: FastifyInstance,
  company: string,
  payload: TestNotificationPayload
): Promise<StandardResponse<{ message: string }>> {
  const { message } = payload;

  try {
    // await fastify.redis.publishNotification(
    //   'test',
    //   'critical',
    //   'api-fastify-scheduler',
    //   message,
    //   '',
    //   {}
    // );

    return { success: true, data: { message } };
  } catch (error: any) {
    fastify.log.error('Test notification failed:', error);
    return { success: false, error: error.message };
  }
}
