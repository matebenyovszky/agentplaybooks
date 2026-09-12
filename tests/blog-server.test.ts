import { afterEach, describe, expect, it, vi } from "vitest";
import { getBlogPost } from "@/lib/blog-server";

describe("blog content loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders generated posts without fetching the public site", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const post = await getBlogPost(
      "welcome-to-agentplaybooks",
      "en",
      "https://agentplaybooks.ai",
    );

    expect(post?.title).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not turn an unknown slug into a same-origin Worker request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(getBlogPost(
      "missing-post",
      "en",
      "https://agentplaybooks.ai",
    )).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
