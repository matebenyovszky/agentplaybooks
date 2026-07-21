import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind class merge utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generate random GUID for playbooks
export function generateGuid(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// Generate API key
export function generateApiKey(): string {
  const randomPart = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  return `apb_live_${randomPart.slice(0, 40)}`;
}

// Generate a high-entropy, URL-safe, one-time collaboration invite token.
export function generateInviteToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

// Hash a bearer token using SHA-256 before persistence.
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Hash API key using SHA-256 (for storage)
export async function hashApiKey(key: string): Promise<string> {
  return hashToken(key);
}

// Get key prefix for display
export function getKeyPrefix(key: string): string {
  return key.slice(0, 12) + "...";
}
