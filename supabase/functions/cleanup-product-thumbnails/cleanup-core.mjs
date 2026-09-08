export const RETENTION_DAYS = 3;
export const MAX_CANDIDATES = 1000;
export const REMOVE_BATCH_SIZE = 100;

export function cutoffIso(now = Date.now()) {
  return new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isOwnedThumbnailPath(row) {
  if (!row || !row.item_id || !row.list_id || typeof row.thumbnail_path !== 'string') return false;
  const prefix = `${row.list_id}/${row.item_id}/`;
  return row.thumbnail_path.startsWith(prefix) &&
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp|gif)$/i.test(row.thumbnail_path);
}

export function chunks(items, size = REMOVE_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
