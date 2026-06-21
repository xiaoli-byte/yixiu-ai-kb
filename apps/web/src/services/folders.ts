import { api } from "@/lib/api-client";

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

export async function tree() {
  const res = await api<Folder[]>("/folders/tree");
  return res;
}

export async function create(data: CreateFolderData) {
  const res = await api<Folder>("/folders", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res;
}

export async function update(id: string, data: UpdateFolderData) {
  const res = await api<Folder>(`/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res;
}

export async function remove(id: string) {
  const res = await api(`/folders/${id}`, { method: "DELETE" });
  return res;
}

const foldersApi = { tree, create, update, remove };

export default foldersApi;
