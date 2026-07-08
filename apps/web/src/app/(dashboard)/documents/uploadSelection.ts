export type UploadSelectionFile = Pick<File, "name" | "size" | "lastModified">;

export function uploadFileKey(file: UploadSelectionFile): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function mergeUploadFiles<T extends UploadSelectionFile>(current: T[], incoming: T[]): T[] {
  const selectedKeys = new Set(current.map(uploadFileKey));
  const merged = [...current];

  for (const file of incoming) {
    const key = uploadFileKey(file);
    if (selectedKeys.has(key)) continue;
    selectedKeys.add(key);
    merged.push(file);
  }

  return merged;
}
