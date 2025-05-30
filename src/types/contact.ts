export interface Contact {
  _id: any;
  owner: string;
  phone: string;
  tags: string[];
}

export interface GetContactsByTagsParams {
  db: any;
  company: string;
  sender: string;
  tags: string;
  limit?: number;
  sort?: string;
}

export interface GetContactsByTagsMultiParams {
  db: any;
  company: string;
  senderList: string[];
  tags: string;
  limit?: number;
  sort?: string;
}
