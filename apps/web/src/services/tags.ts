import { api } from "@/lib/api-client";

export interface Tag {
  id: string;
  name: string;
  type: string;
  documentCount?: number;
}

export interface CreateTagData {
  name: string;
}

export async function list() {
  const res = await api<Tag[]>("/tags");
  return res;
}

export async function stats() {
  const res = await api<Tag[]>("/tags/stats");
  return res;
}

export async function create(data: CreateTagData) {
  const res = await api("/tags", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res;
}

export async function update(id: string, name: string) {
  const res = await api(`/tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return res;
}

export async function remove(id: string) {
  const res = await api(`/tags/${id}`, { method: "DELETE" });
  return res;
}

const tagsApi = { list, stats, create, update, remove };

export default tagsApi;
