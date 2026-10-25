import { afterEach, describe, expect, it, vi } from "vitest";
import { getBlogPost } from "@/lib/blog-server";

const EU_POST = "self-hosted-eu-cybersecurity-requirements";
const LOCALES = ["en", "hu", "de", "es"] as const;
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;

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

  it("ships the self-hosted EU requirements post in every blog locale", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    for (const locale of LOCALES) {
      const post = await getBlogPost(EU_POST, locale, "https://agentplaybooks.ai");
      expect(post, locale).toBeTruthy();
      expect(post?.slug, locale).toBe(EU_POST);
      expect(post?.title, locale).toBeTruthy();
      expect(post?.content, locale).toMatch(/NIS2/);
      expect(post?.content, locale).toMatch(/use_secret/);
      expect(post?.content, locale).not.toMatch(/\bcompliant\b/i);
      expect(post?.content, locale).not.toMatch(/\bcertified\b/i);
      expect(post?.content, locale).not.toMatch(/Integritás Hatóság/i);
      expect(post?.content, locale).not.toMatch(EMAIL_ADDRESS);
      expect(`${post?.title}\n${post?.description}\n${post?.content}`, locale)
        .not.toMatch(EMAIL_ADDRESS);
    }

    const hu = await getBlogPost(EU_POST, "hu");
    expect(hu?.content).toMatch(/2024\. évi LXIX\. törvény/);
    expect(hu?.content).toMatch(/418\/2024\. \(XII\. 23\.\) Korm\. rendelet/);
    expect(hu?.content).toMatch(/7\/2024\. \(VI\. 24\.\) MK rendelet/);
    expect(hu?.content).toMatch(/segít megfelelni/i);

    const en = await getBlogPost(EU_POST, "en");
    expect(en?.content).toMatch(/helps meet/i);
    expect(en?.content).not.toMatch(/2024\. évi LXIX/);
    expect(en?.content).not.toMatch(/418\/2024/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
