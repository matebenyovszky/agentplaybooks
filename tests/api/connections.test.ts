import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/connections/route";

function request(query = "") {
  return new Request(`http://localhost/api/connections${query}`);
}

describe("GET /api/connections", () => {
  it("lists every template", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(body.templates.length);
    expect(body.total).toBeGreaterThan(0);
  });

  it("filters by category", async () => {
    const res = await GET(request("?category=social"));
    const body = await res.json();
    expect(body.templates.length).toBeGreaterThan(0);
    for (const template of body.templates) {
      expect(template.category).toBe("social");
    }
  });

  it("returns one template by id", async () => {
    const res = await GET(request("?id=supabase-mcp"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: "supabase-mcp", name: "Supabase" });
  });

  it("404s an unknown id rather than returning the whole list", async () => {
    const res = await GET(request("?id=not-a-template"));
    expect(res.status).toBe(404);
  });

  it("returns an empty list for an unknown category", async () => {
    const res = await GET(request("?category=nonsense"));
    const body = await res.json();
    expect(body.templates).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("never ships a credential value", async () => {
    // The endpoint is public, so this is the property that matters most.
    const body = JSON.stringify(await (await GET(request())).json());
    expect(body).not.toMatch(/sbp_[a-f0-9]{20}/);
    expect(body).not.toMatch(/gh[ps]_[A-Za-z0-9]{20}/);
    expect(body).not.toMatch(/\beyJ[A-Za-z0-9_-]{20}/);
  });
});
