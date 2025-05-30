// src/plugins/agenda.ts
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Agenda, Job } from '@hokify/agenda';
import { setupAgendaJobs } from '../agenda';

const agendaPlugin: FastifyPluginAsync = async (fastify) => {
  const agenda = new Agenda({ 
    db: { address: fastify.config.MONGODB_DSN },
    processEvery: '30 seconds',
    maxConcurrency: 20,
    defaultConcurrency: 5,
  });

  // Event handlers
  agenda.on('ready', () => {
    fastify.log.info('Agenda successfully connected to MongoDB');
  });

  agenda.on('error', (err) => {
    fastify.log.error({ err }, 'Agenda connection error');
  });

  // Start agenda
  await agenda.start();
  fastify.log.info('Agenda started successfully');
  
  // Setup job definitions
  setupAgendaJobs(agenda, fastify);

  // Decorate fastify instance
  fastify.decorate('agenda', agenda);

  // Job lifecycle logging
  agenda.on('start', (job) => {
    fastify.log.info(
      { 
        jobName: job.attrs.name, 
        jobId: job.attrs._id,
        data: job.attrs.data 
      }, 
      'Job started'
    );
  });

  agenda.on('success', (job) => {
    fastify.log.info(
      { 
        jobName: job.attrs.name, 
        jobId: job.attrs._id,
        result: (job.attrs as any).result 
      }, 
      'Job completed successfully'
    );
  });

  agenda.on('fail', async (err: Error, job: Job) => {
    fastify.log.error(
      { 
        err,
        jobName: job.attrs.name, 
        jobId: job.attrs._id,
        data: job.attrs.data,
        failReason: job.attrs.failReason,
        failCount: job.attrs.failCount,
      }, 
      'Job failed'
    );
    
    // Could add alerting or additional error handling here
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    fastify.log.info('Stopping Agenda gracefully...');
    await agenda.stop();
    fastify.log.info('Agenda stopped');
  });
};

export default fp(agendaPlugin, {
  name: 'agenda',
  dependencies: ['config', 'mongodb'],
});