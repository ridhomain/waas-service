import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Agenda, Job } from '@hokify/agenda';
import { setupAgendaJobs } from '../agenda';

const agendaPlugin: FastifyPluginAsync = async (fastify) => {
  const agenda = new Agenda({ db: { address: fastify.config.MONGODB_DSN } });
  const jobOptions = { priority: 'high', concurrency: 10 };
  const db = fastify.mongo.db;

  agenda.on('ready', () => {
    fastify.log.info('Agenda successfully connected!');
  });

  agenda.on('error', (err) => {
    fastify.log.error('Agenda connection error:', err);
  });

  await agenda.start();
  fastify.log.info('Agenda started!');
  setupAgendaJobs(agenda, fastify);

  fastify.decorate('agenda', agenda);

  agenda.on('start', (job) => {
    fastify.log.info(`Job Started: ${job.attrs.name}, ID: ${job.attrs._id}`);
  });

  agenda.on('success', (job) => {
    fastify.log.info(`Job Completed: ${job.attrs.name}, ID: ${job.attrs._id}`);
  });

  agenda.on('fail', async (err: Error, job: Job) => {
    fastify.log.error(`Job Failed: ${job.attrs.name}, Error: ${err.message}`);
  });

  fastify.addHook('onClose', async () => {
    fastify.log.info('Stopping Agenda...');
    await agenda.stop();
    fastify.log.info('Agenda stopped.');
  });
};

export default fp(agendaPlugin);
