import { afterEach, describe, expect, it, vi } from "vitest";
import { LatestRequest } from "@/lib/latest-request";

describe("latest search request", () => {
  afterEach(() => vi.useRealTimers());
  it("coalesces rapid search input into one request after 300 ms", () => {
    vi.useFakeTimers();
    const requests = new LatestRequest();
    const fetch = vi.fn();
    const first = requests.schedule(fetch, 300);
    vi.advanceTimersByTime(100);
    first();
    requests.schedule(fetch, 300);
    vi.advanceTimersByTime(299);
    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].isCurrent()).toBe(true);
  });
  it("cancels pending work on unmount and runs empty search without delay", () => {
    vi.useFakeTimers();
    const requests = new LatestRequest();
    const fetch = vi.fn();
    requests.schedule(fetch, 300)();
    vi.advanceTimersByTime(300);
    expect(fetch).not.toHaveBeenCalled();
    requests.schedule(fetch, 0);
    vi.advanceTimersByTime(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("aborts the previous fetch and refuses its late result", () => {
    const requests = new LatestRequest();
    const first = requests.begin();
    const second = requests.begin();
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });
  it("cleanup refuses results even if a fetch ignores cancellation", () => {
    const requests = new LatestRequest();
    const first = requests.begin();
    first.cancel();
    const second = requests.begin();
    first.cancel();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    second.cancel();
    expect(second.isCurrent()).toBe(false);
  });
});
