import { describe, expect, it, vi } from "vitest";
import { cachedSingleFlight, type SingleFlightEntry } from "@/lib/cache/single-flight";

function cache<T>() {
  return new Map<string, SingleFlightEntry<T>>();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("single-flight discovery cache", () => {
  it("shares a pending load and reuses its successful result", async () => {
    const entries = cache<string>();
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);

    const first = cachedSingleFlight(entries, "playbook:full", 30_000, 32, load);
    const second = cachedSingleFlight(entries, "playbook:full", 30_000, 32, load);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    pending.resolve("tools-json");
    expect(await first).toBe("tools-json");
    expect(await second).toBe("tools-json");
    expect(await cachedSingleFlight(entries, "playbook:full", 30_000, 32, load)).toBe("tools-json");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries a rejected load", async () => {
    const entries = cache<string>();
    const load = vi.fn().mockRejectedValueOnce(new Error("upstream failed")).mockResolvedValue("tools-json");

    await expect(cachedSingleFlight(entries, "playbook:full", 30_000, 32, load))
      .rejects.toThrow("upstream failed");
    expect(entries.has("playbook:full")).toBe(false);
    expect(await cachedSingleFlight(entries, "playbook:full", 30_000, 32, load)).toBe("tools-json");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not restore an entry invalidated during its load", async () => {
    const entries = cache<string>();
    const pending = deferred<string>();
    const first = cachedSingleFlight(entries, "playbook:full", 30_000, 32, () => pending.promise);

    entries.delete("playbook:full");
    pending.resolve("old-tools");
    expect(await first).toBe("old-tools");
    expect(entries.has("playbook:full")).toBe(false);
    expect(await cachedSingleFlight(entries, "playbook:full", 30_000, 32, async () => "new-tools"))
      .toBe("new-tools");
  });

  it("expires resolved entries and bounds the number of keys", async () => {
    vi.useFakeTimers();
    try {
      const entries = cache<string>();
      const load = vi.fn(async () => "first");
      await cachedSingleFlight(entries, "one", 30_000, 2, load);
      await cachedSingleFlight(entries, "two", 30_000, 2, async () => "second");
      await cachedSingleFlight(entries, "three", 30_000, 2, async () => "third");
      expect(entries.has("one")).toBe(false);
      expect(entries.size).toBe(2);

      vi.advanceTimersByTime(30_001);
      expect(await cachedSingleFlight(entries, "two", 30_000, 2, async () => "updated"))
        .toBe("updated");
    } finally {
      vi.useRealTimers();
    }
  });
});
