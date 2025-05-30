import { Agenda } from "@hokify/agenda";
import { FastifyInstance } from "fastify";
import { defineSendMetaMessageJob } from "./jobs/send-meta-message";
import { defineSendDaisiMessageJob } from "./jobs/send-daisi.message";
import { defineSendMailcastMessageJob } from "./jobs/send-mailcast.message";

export const setupAgendaJobs = (agenda: Agenda, fastify: FastifyInstance) => {
  defineSendMetaMessageJob(agenda);
  defineSendDaisiMessageJob(agenda, fastify);
  defineSendMailcastMessageJob(agenda, fastify);
};
