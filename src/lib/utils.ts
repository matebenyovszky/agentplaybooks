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

// Hash API key using SHA-256 (for storage)
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Get key prefix for display
export function getKeyPrefix(key: string): string {
  return key.slice(0, 12) + "...";
}

