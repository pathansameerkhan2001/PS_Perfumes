/**
 * Short-lived in-memory cache for public storefront reads (catalogue, homepage sections).
 *
 * - Identical requests made at the same time share one network call.
 * - A result is reused for STOREFRONT_TTL_MS, so moving between the homepage, shop, collection
 *   pages and search does not download the same catalogue again and again.
 * - Failed requests are never cached.
 * - Product/combo writes made in this tab call invalidateCached(), so the admin and the
 *   storefront never show stale data after a save; other visitors see changes within the TTL
 *   (or on reload, since nothing is persisted).
 * Admin screens do not use it: they always read fresh data.
 */

export const STOREFRONT_TTL_MS = 60 * 1000;

const entries = new Map();

/**
 * @template T
 * @param {string} key - unique key for the request (include every parameter)
 * @param {() => Promise<T>} load
 * @param {number} [ttl]
 * @returns {Promise<T>}
 */
export function cachedRequest(key, load, ttl = STOREFRONT_TTL_MS) {
  const hit = entries.get(key);
  if (hit && (hit.pending || Date.now() - hit.time < ttl)) return hit.promise;

  const entry = { pending: true, time: Date.now(), hasValue: false, value: undefined };
  entry.promise = load().then(
    (value) => {
      entry.pending = false;
      entry.time = Date.now();
      entry.hasValue = true;
      entry.value = value;
      return value;
    },
    (err) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw err;
    }
  );
  entries.set(key, entry);
  return entry.promise;
}

/** The cached value for key if it is still fresh, otherwise undefined (no request is made). */
export function peekCached(key, ttl = STOREFRONT_TTL_MS) {
  const hit = entries.get(key);
  return hit && hit.hasValue && Date.now() - hit.time < ttl ? hit.value : undefined;
}

/** Drops every cached entry whose key starts with one of the prefixes (all entries if none). */
export function invalidateCached(...prefixes) {
  for (const key of [...entries.keys()]) {
    if (prefixes.length === 0 || prefixes.some((p) => key.startsWith(p))) entries.delete(key);
  }
}
