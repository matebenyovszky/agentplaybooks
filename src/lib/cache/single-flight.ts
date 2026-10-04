export type SingleFlightEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

/** Share concurrent loads, then retain a successful result for a short period. */
export async function cachedSingleFlight<T>(
  cache: Map<string, SingleFlightEntry<T>>,
  key: string,
  ttlMs: number,
  maxEntries: number,
  load: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // Start after inserting the entry so another request in this tick can join.
  const entry: SingleFlightEntry<T> = {
    expiresAt: Date.now() + ttlMs,
    value: Promise.resolve().then(load),
  };
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size > maxEntries) cache.delete(cache.keys().next().value!);

  try {
    const value = await entry.value;
    // An invalidation may have removed this entry while the load was running.
    if (cache.get(key) === entry) entry.expiresAt = Date.now() + ttlMs;
    return value;
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  }
}
