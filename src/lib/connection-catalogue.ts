/**
 * A curated catalogue of connection templates for services people actually
 * reach for, so adding one is picking a name from a list rather than writing
 * transport JSON from scratch.
 *
 * A template is not a credential. Every entry references its secrets *by name*
 * and expects those names to exist on the playbook's Secrets tab — the same
 * resolution federated calls use at runtime. Nothing here holds a value.
 *
 * `source` records where each endpoint came from, because that is what a
 * maintainer needs to know when re-checking it:
 *
 *   - `live-config`   taken from a server already working in production
 *   - `provider-docs` taken from the provider's published documentation
 *
 * The templates are validated against the real resolver in
 * `connection-catalogue.test.ts`: a template cannot declare a secret the
 * resolver would not look up, or reference one it forgot to declare.
 */

import type { FederatedTransportConfig } from "@/lib/mcp/federation";

export type ConnectionCategory =
  | "database"
  | "infrastructure"
  | "developer"
  | "productivity"
  | "social";

/** A value the person adding the connection has to supply before it will work. */
export type ConnectionPlaceholder = {
  /** The literal string to replace, as it appears in transport_config. */
  token: string;
  label: string;
};

export type ConnectionSecret = {
  /** The vault secret name the transport config references. */
  name: string;
  label: string;
  /** Where to get the value. Kept short enough to render next to the field. */
  howTo: string;
};

export type ConnectionTemplate = {
  id: string;
  name: string;
  description: string;
  category: ConnectionCategory;
  source: "live-config" | "provider-docs";
  /** Provider documentation for the endpoint and its scopes. */
  docs: string;
  transport_type: "http" | "sse" | "openapi";
  transport_config: FederatedTransportConfig;
  secrets: ConnectionSecret[];
  placeholders?: ConnectionPlaceholder[];
  /**
   * Set when the credential needs a one-time consent flow before it can be
   * stored. Federation can renew a refresh token indefinitely, but it cannot
   * obtain the first one — that needs a browser, which belongs in the CLI.
   */
  requiresConsent?: boolean;
};

/**
 * Remote MCP servers. These speak MCP over HTTP, so federation proxies them
 * directly and their tools appear alongside the playbook's own.
 */
const REMOTE_MCP: ConnectionTemplate[] = [
  {
    id: "cloudflare-mcp",
    name: "Cloudflare",
    description: "Cloudflare's hosted MCP server — Workers, DNS, logs and docs.",
    category: "infrastructure",
    source: "live-config",
    docs: "https://developers.cloudflare.com/agents/model-context-protocol/",
    transport_type: "http",
    transport_config: {
      url: "https://mcp.cloudflare.com/mcp",
      auth: { type: "bearer", token_secret: "CLOUDFLARE_API_TOKEN" },
    },
    secrets: [{
      name: "CLOUDFLARE_API_TOKEN",
      label: "Cloudflare API token",
      howTo:
        "Dashboard → My Profile → API Tokens → Create Token. For Workers deploys the "
        + "minimum is Account: Workers Scripts (Edit), Account: Account Settings (Read), "
        + "User: User Details (Read). Restrict Account Resources to one account.",
    }],
  },
  {
    id: "supabase-mcp",
    name: "Supabase",
    description: "Supabase's hosted MCP server, scoped to one project.",
    category: "database",
    source: "live-config",
    docs: "https://supabase.com/docs/guides/getting-started/mcp",
    transport_type: "http",
    transport_config: {
      url: "https://mcp.supabase.com/mcp?project_ref=PROJECT_REF",
      auth: { type: "bearer", token_secret: "SUPABASE_ACCESS_TOKEN" },
    },
    secrets: [{
      name: "SUPABASE_ACCESS_TOKEN",
      label: "Supabase personal access token",
      howTo:
        "supabase.com/dashboard/account/tokens. The token is account-wide, so pin the "
        + "secret's allowed_hosts to mcp.supabase.com and api.supabase.com.",
    }],
    placeholders: [{ token: "PROJECT_REF", label: "Project ref (the subdomain of your project URL)" }],
  },
];

/**
 * REST and OpenAPI services behind a static token. Federation calls these as
 * ordinary HTTP, which is also what makes them usable through `use_secret`.
 */
const STATIC_TOKEN_APIS: ConnectionTemplate[] = [
  {
    id: "supabase-management-api",
    name: "Supabase Management API",
    description: "Run SQL, apply migrations and read project config over REST.",
    category: "database",
    source: "live-config",
    docs: "https://supabase.com/docs/reference/api/introduction",
    transport_type: "openapi",
    transport_config: {
      base_url: "https://api.supabase.com",
      auth: { type: "bearer", token_secret: "SUPABASE_ACCESS_TOKEN" },
    },
    secrets: [{
      name: "SUPABASE_ACCESS_TOKEN",
      label: "Supabase personal access token",
      howTo:
        "supabase.com/dashboard/account/tokens. POST /v1/projects/{ref}/database/query "
        + "runs SQL; pass read_only unless you intend to write.",
    }],
  },
  {
    id: "cloudflare-api",
    name: "Cloudflare API",
    description: "Cloudflare's v4 REST API, for anything the MCP server does not cover.",
    category: "infrastructure",
    source: "provider-docs",
    docs: "https://developers.cloudflare.com/api/",
    transport_type: "openapi",
    transport_config: {
      base_url: "https://api.cloudflare.com/client/v4",
      auth: { type: "bearer", token_secret: "CLOUDFLARE_API_TOKEN" },
    },
    secrets: [{
      name: "CLOUDFLARE_API_TOKEN",
      label: "Cloudflare API token",
      howTo:
        "Dashboard → My Profile → API Tokens. Scope it to the smallest permission set "
        + "the task needs, and prefer a token over the legacy global API key.",
    }],
  },
  {
    id: "github-api",
    name: "GitHub API",
    description: "Repositories, issues, pull requests and Actions over REST.",
    category: "developer",
    source: "provider-docs",
    docs: "https://docs.github.com/en/rest",
    transport_type: "openapi",
    transport_config: {
      base_url: "https://api.github.com",
      auth: { type: "bearer", token_secret: "GITHUB_TOKEN" },
    },
    secrets: [{
      name: "GITHUB_TOKEN",
      label: "GitHub personal access token",
      howTo:
        "Settings → Developer settings → Personal access tokens. A fine-grained token "
        + "scoped to specific repositories is preferable to a classic one.",
    }],
  },
];

/**
 * User-scoped services. These act *as a person*, so the credential is a refresh
 * token obtained once with that person's consent. Federation renews it from then
 * on; see `oauth2_refresh_token` in public/docs/mcp-federation.md.
 */
const USER_SCOPED_OAUTH: ConnectionTemplate[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Read and send mail as the authorising user.",
    category: "productivity",
    source: "provider-docs",
    docs: "https://developers.google.com/gmail/api/guides",
    transport_type: "openapi",
    requiresConsent: true,
    transport_config: {
      base_url: "https://gmail.googleapis.com",
      auth: {
        type: "oauth2_refresh_token",
        token_url: "https://oauth2.googleapis.com/token",
        client_id: "GOOGLE_CLIENT_ID",
        client_secret: "GOOGLE_CLIENT_SECRET",
        refresh_token_secret: "GMAIL_REFRESH_TOKEN",
        scopes: ["https://www.googleapis.com/auth/gmail.modify"],
      },
    },
    secrets: [
      {
        name: "GOOGLE_CLIENT_SECRET",
        label: "Google OAuth client secret",
        howTo: "Google Cloud console → APIs & Services → Credentials → OAuth 2.0 Client ID.",
      },
      {
        name: "GMAIL_REFRESH_TOKEN",
        label: "Gmail refresh token",
        howTo:
          "Obtained once through the consent screen with access_type=offline. Google only "
          + "returns it on the first authorisation — revoke and re-consent if you lose it.",
      },
    ],
    placeholders: [{ token: "GOOGLE_CLIENT_ID", label: "OAuth client ID (not secret)" }],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Read and write the authorising user's calendars.",
    category: "productivity",
    source: "provider-docs",
    docs: "https://developers.google.com/calendar/api/guides/overview",
    transport_type: "openapi",
    requiresConsent: true,
    transport_config: {
      base_url: "https://www.googleapis.com/calendar/v3",
      auth: {
        type: "oauth2_refresh_token",
        token_url: "https://oauth2.googleapis.com/token",
        client_id: "GOOGLE_CLIENT_ID",
        client_secret: "GOOGLE_CLIENT_SECRET",
        refresh_token_secret: "GOOGLE_CALENDAR_REFRESH_TOKEN",
        scopes: ["https://www.googleapis.com/auth/calendar"],
      },
    },
    secrets: [
      {
        name: "GOOGLE_CLIENT_SECRET",
        label: "Google OAuth client secret",
        howTo: "Google Cloud console → APIs & Services → Credentials → OAuth 2.0 Client ID.",
      },
      {
        name: "GOOGLE_CALENDAR_REFRESH_TOKEN",
        label: "Calendar refresh token",
        howTo: "Consent once with access_type=offline for the calendar scope.",
      },
    ],
    placeholders: [{ token: "GOOGLE_CLIENT_ID", label: "OAuth client ID (not secret)" }],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Post and read as the authorising member.",
    category: "social",
    source: "provider-docs",
    docs: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow",
    transport_type: "openapi",
    requiresConsent: true,
    transport_config: {
      base_url: "https://api.linkedin.com",
      auth: {
        type: "oauth2_refresh_token",
        token_url: "https://www.linkedin.com/oauth/v2/accessToken",
        client_id: "LINKEDIN_CLIENT_ID",
        client_secret: "LINKEDIN_CLIENT_SECRET",
        refresh_token_secret: "LINKEDIN_REFRESH_TOKEN",
      },
    },
    secrets: [
      {
        name: "LINKEDIN_CLIENT_SECRET",
        label: "LinkedIn app client secret",
        howTo: "LinkedIn developer portal → your app → Auth.",
      },
      {
        name: "LINKEDIN_REFRESH_TOKEN",
        label: "LinkedIn refresh token",
        howTo:
          "Refresh tokens are not enabled for every LinkedIn app — check your app's "
          + "products before relying on this rather than re-consenting.",
      },
    ],
    placeholders: [{ token: "LINKEDIN_CLIENT_ID", label: "Client ID (not secret)" }],
  },
  {
    id: "x",
    name: "X",
    description: "Post and read as the authorising account.",
    category: "social",
    source: "provider-docs",
    docs: "https://docs.x.com/resources/fundamentals/authentication",
    transport_type: "openapi",
    requiresConsent: true,
    transport_config: {
      base_url: "https://api.x.com/2",
      auth: {
        type: "oauth2_refresh_token",
        token_url: "https://api.x.com/2/oauth2/token",
        client_id: "X_CLIENT_ID",
        client_secret: "X_CLIENT_SECRET",
        refresh_token_secret: "X_REFRESH_TOKEN",
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      },
    },
    secrets: [
      {
        name: "X_CLIENT_SECRET",
        label: "X app client secret",
        howTo:
          "Developer portal → your app → Keys and tokens. A public PKCE client has no "
          + "secret; drop client_secret from the config and this secret with it.",
      },
      {
        name: "X_REFRESH_TOKEN",
        label: "X refresh token",
        howTo:
          "Requires the offline.access scope at consent time, otherwise no refresh token "
          + "is issued. X rotates it on every use, which federation handles.",
      },
    ],
    placeholders: [{ token: "X_CLIENT_ID", label: "Client ID (not secret)" }],
  },
];

export const CONNECTION_TEMPLATES: ConnectionTemplate[] = [
  ...REMOTE_MCP,
  ...STATIC_TOKEN_APIS,
  ...USER_SCOPED_OAUTH,
];

export function connectionTemplate(id: string): ConnectionTemplate | undefined {
  return CONNECTION_TEMPLATES.find((template) => template.id === id);
}

export function connectionTemplatesByCategory(): Record<ConnectionCategory, ConnectionTemplate[]> {
  const grouped = {} as Record<ConnectionCategory, ConnectionTemplate[]>;
  for (const template of CONNECTION_TEMPLATES) {
    (grouped[template.category] ??= []).push(template);
  }
  return grouped;
}

/**
 * The placeholders still present in a config, so the editor can refuse to save
 * a template nobody finished filling in. Matches whole words only, so a real
 * value that happens to contain the token as a substring is not flagged.
 */
export function unresolvedPlaceholders(
  template: ConnectionTemplate,
  config: unknown,
): string[] {
  if (!template.placeholders?.length) return [];
  const serialised = JSON.stringify(config ?? {});
  return template.placeholders
    .filter(({ token }) => new RegExp(`\\b${token}\\b`).test(serialised))
    .map(({ token }) => token);
}
