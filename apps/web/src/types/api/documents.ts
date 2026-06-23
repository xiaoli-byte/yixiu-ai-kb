// 文档相关类型
export interface DocumentTag {
  id: string;
  name: string;
}

export interface DocumentDto {
  id: string;
  title: string;
  mime: string;
  size: number;
  status: string;
  folderId: string | null;
  ownerId: string;
  ownerName?: string;
  tags: DocumentTag[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  idx: number;
  text: string;
  tokens: number;
}

export interface DocumentDetail extends DocumentDto {
  chunks: DocumentChunk[];
  errorMessage?: string;
}

export interface DocumentListResponse {
  items: DocumentDto[];
  total: number;
}

export interface DocumentQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  folderId?: string;
  tags?: string;
}

export interface DocumentUpdateData {
  title?: string;
  folderId?: string | null;
}
