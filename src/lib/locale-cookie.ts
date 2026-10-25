import { locales, type Locale } from "@/i18n/config";

/** Preference cookie only — not a session. SameSite=Lax; Secure on HTTPS. */
export function localeCookie(locale: Locale, secure: boolean): string {
  if (!(locales as readonly string[]).includes(locale)) {
    throw new Error("unsupported locale");
  }
  return `NEXT_LOCALE=${locale};path=/;max-age=31536000;SameSite=Lax${secure ? ";Secure" : ""}`;
}
