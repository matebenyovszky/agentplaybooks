/**
 * Is the account behind a credential still allowed to act?
 *
 * Supabase Auth refuses a banned or deleted user at sign-in, but nothing else
 * did: an API key, or a session token not yet expired, kept working. Every
 * credential the API accepts is therefore checked against the account that
 * stands behind it (public.account_is_active). The answer is shared within
 * one Request, so a disabled account is refused from its next request on.
 *
 * Fail closed: if the check cannot be made, the credential is not accepted.
 */

import { getServiceSupabase } from "./supabase";

const checks = new WeakMap<Request, Map<string, Promise<boolean>>>();

export function accountIsActive(request: Request, userId: string): Promise<boolean> {
  let perRequest = checks.get(request);
  if (!perRequest) {
    perRequest = new Map();
    checks.set(request, perRequest);
  }
  let check = perRequest.get(userId);
  if (!check) {
    check = (async () => {
      const { data, error } = await getServiceSupabase().rpc("account_is_active", { p_user_id: userId });
      return !error && data === true;
    })().catch(() => false);
    perRequest.set(userId, check);
  }
  return check;
}
