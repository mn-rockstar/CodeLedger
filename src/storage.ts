import type { StoredData } from "./types";

export function getStored<K extends keyof StoredData>(
  keys: K[]
): Promise<Pick<StoredData, K>> {
  return chrome.storage.local.get(keys) as Promise<Pick<StoredData, K>>;
}

export function setStored(partial: Partial<StoredData>): Promise<void> {
  return chrome.storage.local.set(partial);
}

export function removeStored(keys: (keyof StoredData)[]): Promise<void> {
  return chrome.storage.local.remove(keys as string[]);
}
