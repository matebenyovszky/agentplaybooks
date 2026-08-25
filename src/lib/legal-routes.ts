export const LEGAL_CANONICAL_PATHS = ["/privacy", "/terms"] as const;

export const LEGAL_REDIRECTS = [
  { source: "/privacy-policy", destination: "/privacy", statusCode: 301 as const },
  { source: "/legal", destination: "/privacy", statusCode: 301 as const },
  { source: "/legal/privacy", destination: "/privacy", statusCode: 301 as const },
  { source: "/terms-of-service", destination: "/terms", statusCode: 301 as const },
];
