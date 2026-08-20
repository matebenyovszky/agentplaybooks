import { describe, expect, it } from "vitest";
import {
  CONNECTION_TEMPLATES,
  connectionTemplate,
  connectionTemplatesByCategory,
  unresolvedPlaceholders,
} from "./connection-catalogue";
import { referencedSecretNames } from "./mcp/secret-references";

/**
 * The catalogue is data, and data rots. These tests cross-check every template
 * against the resolver that will actually run it, so a template cannot promise
 * a credential federation would never look up — or reference one it forgot to
 * document.
 */

describe("connection catalogue", () => {
  it("has unique ids", () => {
    const ids = CONNECTION_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is not empty and covers more than one category", () => {
    expect(CONNECTION_TEMPLATES.length).toBeGreaterThan(0);
    expect(Object.keys(connectionTemplatesByCategory()).length).toBeGreaterThan(1);
  });

  it("looks up a template by id", () => {
    expect(connectionTemplate("cloudflare-mcp")?.name).toBe("Cloudflare");
    expect(connectionTemplate("no-such-template")).toBeUndefined();
  });

  describe.each(CONNECTION_TEMPLATES.map((template) => [template.id, template] as const))(
    "%s",
    (_id, template) => {
      it("declares exactly the secrets the resolver will look up", () => {
        const resolved = referencedSecretNames(template.transport_config).sort();
        const declared = template.secrets.map((secret) => secret.name).sort();
        expect(declared).toEqual(resolved);
      });

      it("names a reachable https endpoint", () => {
        const config = template.transport_config as Record<string, unknown>;
        const endpoint = (config.url ?? config.base_url ?? config.spec_url) as string | undefined;
        expect(endpoint, "one of url / base_url / spec_url is required").toBeDefined();
        expect(new URL(endpoint as string).protocol).toBe("https:");
      });

      it("carries no credential value, only names", () => {
        const serialised = JSON.stringify(template.transport_config);
        // The shapes real tokens take. A template holding one would leak it to
        // every user of the catalogue.
        expect(serialised).not.toMatch(/sbp_[a-f0-9]{20}/);
        expect(serialised).not.toMatch(/gh[ps]_[A-Za-z0-9]{20}/);
        expect(serialised).not.toMatch(/\beyJ[A-Za-z0-9_-]{20}/);
      });

      it("explains where every secret comes from", () => {
        for (const secret of template.secrets) {
          expect(secret.howTo.length, `${secret.name} needs a howTo`).toBeGreaterThan(20);
          expect(secret.label.length).toBeGreaterThan(0);
        }
      });

      it("documents itself with a provider link", () => {
        expect(new URL(template.docs).protocol).toBe("https:");
      });

      it("flags a consent flow exactly when it uses a refresh token", () => {
        const usesRefreshToken =
          (template.transport_config.auth?.type ?? "") === "oauth2_refresh_token";
        expect(Boolean(template.requiresConsent)).toBe(usesRefreshToken);
      });
    },
  );
});

describe("unresolvedPlaceholders", () => {
  const supabase = connectionTemplate("supabase-mcp")!;

  it("reports a placeholder still sitting in the config", () => {
    expect(unresolvedPlaceholders(supabase, supabase.transport_config))
      .toEqual(["PROJECT_REF"]);
  });

  it("reports nothing once it has been filled in", () => {
    const filled = JSON.parse(
      JSON.stringify(supabase.transport_config).replace("PROJECT_REF", "abcdefghijklmnop"),
    );
    expect(unresolvedPlaceholders(supabase, filled)).toEqual([]);
  });

  it("reports nothing for a template that has no placeholders", () => {
    const cloudflare = connectionTemplate("cloudflare-mcp")!;
    expect(cloudflare.placeholders).toBeUndefined();
    expect(unresolvedPlaceholders(cloudflare, cloudflare.transport_config)).toEqual([]);
  });

  it("does not flag a real value that merely contains the token as a substring", () => {
    const filled = { url: "https://mcp.supabase.com/mcp?project_ref=MYPROJECT_REFERENCE" };
    expect(unresolvedPlaceholders(supabase, filled)).toEqual([]);
  });
});
