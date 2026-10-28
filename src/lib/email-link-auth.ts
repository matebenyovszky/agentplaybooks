import { postAuthPath } from "./auth-redirect";

export function emailLinkCredentials(email: string, requestedNext: string | null, origin: string) {
  return {
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: origin + postAuthPath(requestedNext, origin),
    },
  };
}
