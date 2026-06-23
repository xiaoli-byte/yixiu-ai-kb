// 标签相关类型
export interface Tag {
  id: string;
  name: string;
  type: string;
  documentCount?: number;
}

export interface CreateTagData {
  name: string;
}

export interface UpdateTagData {
  name: string;
}
