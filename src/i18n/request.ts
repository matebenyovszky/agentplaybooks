import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { resolveLocale } from "./resolve-locale";

export default getRequestConfig(async () => {
  // Try to get locale from cookie first (NEXT_LOCALE is the standard next-intl cookie name)
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("NEXT_LOCALE")?.value, (await headers()).get("accept-language"));

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});

