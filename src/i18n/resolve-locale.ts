import { defaultLocale, locales, type Locale } from "./config";

/** Keep SSR and public page cache keys on exactly the same locale selection. */
export function resolveLocale(cookieLocale?: string, acceptLanguage?: string | null): Locale {
  if (cookieLocale && locales.includes(cookieLocale as Locale)) return cookieLocale as Locale;
  const preferred = acceptLanguage?.split(",")[0]?.split("-")[0];
  return preferred && locales.includes(preferred as Locale) ? preferred as Locale : defaultLocale;
}
