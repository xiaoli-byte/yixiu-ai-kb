// 文件夹相关类型
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  children?: Folder[];
}

export interface CreateFolderData {
  name: string;
  parentId?: string | null;
}

export interface UpdateFolderData {
  name: string;
  parentId?: string | null;
}
