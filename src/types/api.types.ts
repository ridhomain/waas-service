export interface PaginationQuery {
  limit?: number;
  skip?: number;
  page?: number;
}

export interface TaskFilterQuery extends PaginationQuery {
  status?: string;
  channel?: string;
  type?: string;
  label?: string;
  agentId?: string;
  scheduledBefore?: string;
}
