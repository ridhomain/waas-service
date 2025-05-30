import { FastifyInstance } from 'fastify';
import { nanoid, normalizeLines, normalizePhone } from '../utils/index';
import _ from 'lodash';
// import {
//   BroadcastByTagsPayload,
//   PreviewScheduleByTagsPayload,
//   ScheduleByPhonesPayload,
//   SendBroadcastNowPayload,
//   ScheduleMultiSenderPayload,
//   BroadcastByPhonesPayload,
//   BroadcastMultiSenderPayload,
//   CancelBroadcastPayload
// } from '../types/broadcast';
import { GetContactsByTagsParams, GetContactsByTagsMultiParams, Contact } from '../types/contact';

const { flatMap, uniqBy, groupBy, chunk, uniq } = _;

export const getContactsByTags = async ({
  db,
  company,
  sender,
  tags,
  limit = 10000,
  sort = '-createdAt',
}: GetContactsByTagsParams): Promise<{ total: number; contacts: Contact[] }> => {
  const tagList = tags.split(',');
  const tubes: Array<{ tag: string; phones: string[]; len: number }> = [];
  let contactList: Contact[] = [];

  const Contacts = db.collection('contacts');

  for await (const tag of tagList) {
    const re = new RegExp(tag + '(\\D|$)', 'i');
    const filter = { tags: re, company, owner: sender };

    const totalMatching = await Contacts.countDocuments(filter);
    const chunks = chunk([...Array(totalMatching).keys()], limit);

    for await (const group of chunks) {
      const aSkip = group[0] === 0 ? 0 : group[0] - 1;
      const contacts = await Contacts.find(filter, {
        skip: aSkip,
        limit,
        sort: { createdAt: sort.startsWith('-') ? -1 : 1 },
      }).toArray();

      if (!contacts.length) continue;

      const phones = flatMap(contacts, 'phone');
      tubes.push({ tag, phones, len: phones.length });
      contactList = [...contactList, ...contacts];
    }
  }

  const uniqContacts: Contact[] = uniqBy(contactList, 'phone').map((c) => ({
    _id: c._id,
    owner: c.owner,
    phone: c.phone,
    tags: c.tags,
  }));

  return {
    total: uniqContacts.length,
    contacts: uniqContacts,
  };
};

export const getContactsByTagsMulti = async ({
  db,
  company,
  senderList,
  tags,
  limit = 10000,
  sort = '-createdAt',
}: GetContactsByTagsMultiParams): Promise<{
  nLen: number;
  uLen: number;
  groupedUniqContacts: Record<string, Contact[]>;
}> => {
  const tagList = tags.split(',');
  const tubes: Array<{ tag: string; phones: string[]; len: number }> = [];
  let contactList: Contact[] = [];

  const Contacts = db.collection('contacts');

  for await (const tag of tagList) {
    const re = new RegExp(tag + '(\\D|$)', 'i');
    const filter = { tags: re, company, owner: { $in: senderList } };

    const totalMatching = await Contacts.countDocuments(filter);
    const chunks = chunk([...Array(totalMatching).keys()], limit);

    for await (const group of chunks) {
      const aSkip = group[0] === 0 ? 0 : group[0] - 1;
      const contacts = await Contacts.find(filter, {
        skip: aSkip,
        limit,
        sort: { createdAt: sort.startsWith('-') ? -1 : 1 },
      }).toArray();

      if (!contacts.length) continue;

      const phones = flatMap(contacts, 'phone');
      tubes.push({ tag, phones, len: phones.length });
      contactList = [...contactList, ...contacts];
    }
  }

  const aPhones = flatMap(tubes, 'phones');
  const uPhones = [...new Set(aPhones)];

  const uniqContacts: Contact[] = uniqBy(contactList, 'phone').map((c) => ({
    _id: c._id,
    owner: c.owner,
    phone: c.phone,
    tags: c.tags,
  }));

  const groupedUniqContacts = groupBy(uniqContacts, 'owner');

  return {
    nLen: aPhones.length,
    uLen: uPhones.length,
    groupedUniqContacts,
  };
};

export async function scheduleBroadcastByTags(
  fastify: FastifyInstance,
  company: string,
  payload: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  const { schedule, sender, message, userId, label, variables, tags, options } = payload;

  const db = fastify.mongo.db;

  if (!db) {
    return { success: false, error: 'db connection error' };
  }

  const agenda = fastify.agenda;
  const Tasks = db.collection('tasks');
  const batchId = nanoid();
  const streamName = `BROADCAST:${company}:${sender}:${batchId}`;

  try {
    const pattern = `BROADCAST:${company}:${sender}:*`;
    const matches = await fastify.redis.client.keys(pattern);

    if (matches.length > 0) {
      return {
        success: false,
        error: 'A broadcast is already scheduled / running for this sender.',
      };
    }

    const { total, contacts } = await getContactsByTags({ db, company, sender, tags });

    if (total === 0) {
      return { success: false, error: 'no contacts found!' };
    }

    const items = contacts.map((c, idx) => ({
      company,
      batch: batchId,
      n: idx + 1,
      T: total,
      msg: message,
      options,
      variables,
      sender,
      phone: c.phone,
      label,
      userId,
      flags: `BC-${batchId}`,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const insertedTasksResult = await Tasks.insertMany(items);
    const insertedTasks = items.map((task, idx) => ({
      ...task,
      _id: insertedTasksResult.insertedIds[idx],
    }));

    await agenda.schedule(schedule!, 'send-broadcast', {
      cluster: company,
      sender,
      label,
      message,
      tags,
      options,
      variables,
      batchId,
      userId,
      total,
    });

    const pipeline = fastify.redis.client.pipeline();
    for (const task of insertedTasks) {
      pipeline.xadd(
        streamName,
        '*',
        'phone',
        String(task.phone),
        'batchId',
        String(task.batch),
        'taskId',
        String(task._id)
      );
    }

    const publishedCount = ((await pipeline.exec()) as [Error | null, any][]).filter(
      ([err]) => !err
    ).length;

    fastify.log.info(`Published ${publishedCount} tasks to ${streamName}`);

    return { success: true, data: { batchId } };
  } catch (error: any) {
    fastify.log.error('Schedule broadcast failed:', error);
    return { success: false, error: error.message };
  }
}

export async function previewScheduleBroadcastByTags(
  fastify: FastifyInstance,
  company: string,
  payload: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  const { sender, schedule, tags } = payload;
  const db = fastify.mongo.db;

  try {
    const pattern = `BROADCAST:${company}:${sender}:*`;
    const [streamKey] = (await fastify.redis.client.keys(pattern)) || [];

    let hasScheduledBatch = false;
    let conflictWithin12Hours = false;
    let existingScheduledAt: number | null = null;

    if (streamKey) {
      const [firstEntry] = await fastify.redis.client.xrange(streamKey, '-', '+', 'COUNT', 1);

      if (firstEntry) {
        const [entryId] = firstEntry;
        const [timestampStr] = entryId.split('-');
        existingScheduledAt = parseInt(timestampStr);
        hasScheduledBatch = true;

        if (schedule) {
          const uiScheduleTs = new Date(schedule).getTime();
          conflictWithin12Hours =
            Math.abs(uiScheduleTs - existingScheduledAt) <= 12 * 60 * 60 * 1000;
        }
      }
    }

    const { total } = await getContactsByTags({ db, company, sender, tags });

    return {
      success: true,
      data: {
        total,
        hasScheduledBatch,
        conflictWithin12Hours,
        existingScheduledAt,
      },
    };
  } catch (error: any) {
    fastify.log.error('Preview schedule broadcast by tags failed:', error);
    return { success: false, error: error.message };
  }
}

export async function scheduleBroadcastByPhones(
  fastify: FastifyInstance,
  company: string,
  payload: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  const { schedule, sender, message, userId, label, variables, phones, options, tags } = payload;

  const db = fastify.mongo.db;
  const agenda = fastify.agenda;
  const Tasks = db?.collection('tasks');
  const batchId = nanoid();
  const streamName = `BROADCAST:${company}:${sender}:${batchId}`;
  let phoneList: string[] = [];

  try {
    const pattern = `BROADCAST:${company}:${sender}:*`;
    const matches = await fastify.redis.client.keys(pattern);

    if (matches.length > 0) {
      fastify.log.error(`Sender ${sender} already has a batch in progress: ${matches[0]}`);
      return {
        success: false,
        error: 'A broadcast is already scheduled / running for this sender.',
      };
    }

    if (phones) {
      const phoneLines = normalizeLines(phones);
      const pl = phoneLines.split(',').map((a) => normalizePhone(a));
      phoneList.push(...pl);
    }

    const uniqPhones = uniq(phoneList);

    const items = uniqPhones.map((p, idx) => ({
      company,
      batch: batchId,
      n: idx + 1,
      T: phoneList.length,
      msg: message,
      options,
      variables,
      sender,
      phone: p,
      label,
      userId,
      flags: `BC-${batchId}`,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const insertedTasksResult = await Tasks?.insertMany(items);
    const insertedTasks = items.map((task, idx) => ({
      ...task,
      _id: insertedTasksResult?.insertedIds[idx],
    }));

    await agenda.schedule(schedule, 'send-broadcast', {
      cluster: company,
      sender,
      label,
      message,
      tags,
      options,
      variables,
      batchId,
      userId,
      total: insertedTasks.length,
    });

    const pipeline = fastify.redis.client.pipeline();
    for (const task of insertedTasks) {
      pipeline.xadd(
        streamName,
        '*',
        'phone',
        String(task.phone),
        'batchId',
        String(task.batch),
        'taskId',
        String(task._id)
      );
    }
    const execResults: [Error | null, any][] = await pipeline.exec();
    const publishedCount = execResults.filter(([err]) => !err).length;

    fastify.log.info(`Published ${publishedCount} tasks to ${streamName}.`);
    return { success: true, data: { batchId } };
  } catch (error: any) {
    fastify.log.error('Schedule broadcast failed:', error);
    return { success: false, error: error.message };
  }
}

export async function scheduleBroadcastMultiSender(
  fastify: FastifyInstance,
  company: string,
  payload: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  const { scheduleMap, senderList, message, userId, label, variables, tags, options } = payload;
  const db = fastify.mongo.db;
  const agenda = fastify.agenda;
  const Tasks = db?.collection('tasks');
  const streamValidationRes: { sender: string }[] = [];
  const result: any[] = [];

  try {
    for (const s of senderList) {
      const pattern = `BROADCAST:${company}:${s}:*`;
      const matches = await fastify.redis.client.keys(pattern);
      if (matches.length > 0) streamValidationRes.push({ sender: s });
    }

    if (streamValidationRes.length > 0) {
      const failedSenderList = streamValidationRes.map((item) => item.sender).join(', ');
      return {
        success: false,
        error: `Cannot schedule new broadcast. Another broadcast is still in queue. ${failedSenderList}`,
      };
    }

    const { nLen, uLen, groupedUniqContacts } = await getContactsByTagsMulti({
      db,
      company,
      senderList,
      tags,
    });
    if (nLen === 0 || uLen === 0) return { success: false, error: 'no contacts found!' };

    const listPerSender = Object.entries(groupedUniqContacts).map(([sender, contacts]) => ({
      sender,
      contacts,
    }));

    for (const list of listPerSender) {
      const batchId = nanoid();
      const streamName = `BROADCAST:${company}:${list.sender}:${batchId}`;
      const total = list.contacts.length;

      const items = list.contacts.map((c, idx) => ({
        company,
        batch: batchId,
        n: idx + 1,
        T: total,
        msg: message,
        options,
        variables,
        sender: list.sender,
        phone: c.phone,
        label,
        userId,
        flags: `BC-${batchId}`,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const insertedTasksResult = await Tasks?.insertMany(items);
      const insertedTasks = items.map((task, idx) => ({
        ...task,
        _id: insertedTasksResult?.insertedIds[idx],
      }));

      await agenda.schedule(scheduleMap[list.sender], 'send-broadcast', {
        cluster: company,
        sender: list.sender,
        label,
        message,
        tags,
        options,
        variables,
        batchId,
        userId,
        total,
      });

      const pipeline = fastify.redis.client.pipeline();
      for (const task of insertedTasks) {
        pipeline.xadd(
          streamName,
          '*',
          'phone',
          String(task.phone),
          'batchId',
          String(task.batch),
          'taskId',
          String(task._id)
        );
      }
      const execResults: [Error | null, any][] = await pipeline.exec();
      const publishedCount = execResults.filter(([err]) => !err).length;

      result.push({
        sender: list.sender,
        publishedTasks: publishedCount,
        totalTasks: insertedTasks.length,
        schedule: scheduleMap[list.sender],
        batchId,
      });
    }

    return { success: true, data: result };
  } catch (error: any) {
    fastify.log.error('Schedule broadcast failed:', error);
    return { success: false, error: error.message };
  }
}

export async function cancelBroadcast(
  fastify: FastifyInstance,
  company: string,
  payload: any
): Promise<{ success: boolean; message?: string; data?: any; error?: string }> {
  const { batchId, sender } = payload;
  const redis = fastify.redis.client;
  const agenda = fastify.agenda;
  const streamName = `BROADCAST:${company}:${sender}:${batchId}`;

  try {
    const exists = await redis.exists(streamName);
    if (exists) {
      const range = await redis.xrange(streamName, '-', '+');
      for (const [msgId] of range) {
        await redis.xdel(streamName, msgId);
      }
      await redis.del(streamName);
    }

    const cancelCount = await agenda.cancel({
      'data.batchId': batchId,
      'data.sender': sender,
      'data.cluster': company,
    });

    return {
      success: true,
      message: 'Broadcast canceled (stream cleared and agenda job canceled)',
      data: { batchId, sender },
    };
  } catch (error: any) {
    fastify.log.error('Failed to cancel broadcast:', error);
    return { success: false, error: error.message };
  }
}

export async function sendBroadcastNow(
  fastify: FastifyInstance,
  company: string,
  payload: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  const db = fastify.mongo.db;
  const agenda = fastify.agenda;
  const Tasks = db?.collection('tasks');
  const { sender, message, userId, label, variables, tags, options } = payload;

  try {
    const batchId = nanoid();
    const { total, contacts } = await getContactsByTags({ db, company, sender, tags });

    const items = contacts.map((c, idx) => ({
      company,
      batch: batchId,
      n: idx + 1,
      T: total,
      msg: message,
      options,
      variables,
      sender,
      phone: c.phone,
      label,
      userId,
      flags: `BC-${batchId}`,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await Tasks?.insertMany(items);

    await agenda.now('send-broadcast', {
      cluster: company,
      sender,
      label,
      message,
      tags,
      options,
      variables,
      batchId,
      userId,
    });

    return { success: true, data: { batchId } };
  } catch (error: any) {
    fastify.log.error('Send broadcast now failed:', error);
    return { success: false, error: error.message };
  }
}
