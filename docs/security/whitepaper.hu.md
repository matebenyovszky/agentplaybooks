# AgentPlaybooks biztonsági fehérkönyv

**Verzió:** 2026-10-25 · **Forrás:** a repó `main` ágának akkor aktuális kódja (benne a merge-elt [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200), [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201), [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204), [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205)). A maradék párhuzamos PR-ek: **Folyamatban / In progress**, merge előtt nem számítanak késznek.  
**Elsődleges nyelv:** magyar. Angol: [whitepaper.md](./whitepaper.md).

> **Jogi ellenőrzés szükséges.** Az alábbi hatály-, NIS2-, MK rendeleti, GDPR- és gyártói-státusz értelmezések nem minősülnek jogi tanácsnak. Éles bevezetés előtt az ügyfél jogászának és IBF-jének kell jóváhagynia.

## 1. Cél és hatály

Ez a dokumentum a beszállítói értékelést és az EIR biztonsági osztályba sorolást támogatja. A kért fókusz:

| Hivatkozás | Amit a csomag támogat | Megjegyzés |
|------------|----------------------|------------|
| NIS2 21. cikk (2) (a) | Kockázatelemzési és információbiztonsági politika anyaga: architektúra, adatfolyamok, kontrollleképezés | Az ügyfél saját politikája; mi bemenetet adunk — **jogi ellenőrzés szükséges** |
| NIS2 21. cikk (2) (d) | Ellátási lánc: komponenslista, SDLC, provenance, ismert hiányosságok | Mi a termék beszállítója vagyunk az ügyfél számára — **jogi ellenőrzés szükséges** |
| NIS2 21. cikk (2) (g) | Kiberhigiéniai gyakorlatok dokumentálása (titokkezelés, RBAC, audit); a képzés ügyféli feladat | A rendelet szövege szerinti „képzés” nem szoftverfunkció — **jogi ellenőrzés szükséges** |
| 7/2024. (VI. 24.) MK rendelet | NIST SP 800-53 rev. 5 családokra mappelt sablon | Pontos MK tétel-azonosítókat **nem** találunk ki; lásd [risk-assessment.hu.md](./risk-assessment.hu.md) |

A 21. cikk (2) további betűi (b, c, e, f, h, i, j) a sablonban szerepelnek, mert a MK rendelet családjai átfednek velük. Ez nem jelenti, hogy a termék önmagában kielégíti azokat — **jogi ellenőrzés szükséges**.

**Üzemeltetési feltételezés ehhez a csomaghoz:** az ügyfél a terméket **saját infrastruktúrán** futtatja (`docker-compose.yml` + önállóan üzemeltetett Supabase). A nyilvános SaaS (`agentplaybooks.ai` / Cloudflare) más adatkezelői / adatfeldolgozói képet ad — **jogi ellenőrzés szükséges**.

## 2. Termék, röviden

Az AgentPlaybooks nyílt forrású (MIT), hordozható AI-ügynök konfigurációs környezet: playbookok, személyiségek, skillek, MCP/OpenAPI eszközök, memória, vászon, titokszéf. A webes alkalmazás Next.js; az API Hono a Next.js App Router alatt; az adatok és a hitelesítés Supabase (PostgreSQL + GoTrue).

Forrás: [`public/docs/architecture.md`](../../public/docs/architecture.md), [`README.md`](../../README.md).

## 3. Architektúra és megbízhatósági határok

```
Ügyfél-ügynökök / CLI / Python loader / böngésző
        │  HTTPS (ügyfél TLS-terminálása; a compose önmagában HTTP :3000)
        ▼
┌───────────────────────────────────────────┐
│  TB-1  Next.js alkalmazás (Docker `app`)  │  SECRETS_ENCRYPTION_KEY
│  UI, REST, MCP, OpenAPI                   │  SUPABASE_SERVICE_ROLE_KEY
│  AES-256-GCM visszafejtés a proxy úton    │  a szerver képes a plaintextre
└────────────────────┬──────────────────────┘
                     │ JWT / service_role Data API
                     ▼
┌───────────────────────────────────────────┐
│  TB-2  Supabase (ügyfél stackje)          │  Auth JWT, Postgres,
│  Auth, PostgREST, Kong, DB kötet          │  ciphertext, audit_logs
└───────────────────────────────────────────┘
                     │
        TB-3 szándékos kimenő hívások: use_secret / federált MCP
        a titok allowed_hosts + SSRF-szűrő szerint
```

| Határ | Mi van belül | Ki bízik meg kiben |
|-------|----------------|--------------------|
| TB-1 Alkalmazásfolyamat | Next.js a `Dockerfile` non-root `nextjs` userrel, port 3000 | A folyamat tartja a mesterkulcsot és a service role kulcsot; kompromittálása a széf plaintextjét jelenti |
| TB-2 Supabase | Auth + Postgres + Data API, ügyfél hálózata | Az alkalmazás service_role-lal hív; az RLS a böngészős/anon utakat védi, **nem** a service_role-t |
| TB-3 Kimenő proxy | `use_secret` és federált eszközök | Az ügynök nem látja a titkot, de a célt ő választja; `allowed_hosts` + privát IP tiltás |
| TB-4 mTLS | Hosted: `cf.tlsClientAuth`. Self-host: `MTLS_MODE=proxy` megbízható terminátor mögött | A Node nem terminál TLS-t. Terminátor nélkül az alapértelmezés fail-closed. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) |

A compose **nem** indít adatbázist. `docker-compose.yml` ezt kimondja; a bare Postgres nem elég, mert minden útvonal a Supabase Data API-t és Auth-ot hívja. Lásd [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md), [`docker-compose.yml`](../../docker-compose.yml).

A service_role megkerüli az RLS-t. Az engedélyezés az alkalmazáskódban van: [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts), [`supabase/README.md`](../../supabase/README.md).

## 4. Adatfolyamok és adatosztályok

| Adatosztály | Hol van | Titkosítás / kezelés | Ki fér hozzá |
|-------------|---------|----------------------|--------------|
| Titok plaintext | Csak memóriában, proxy/reveal közben | Nincs at rest | Alkalmazásfolyamat |
| Titok ciphertext | `secrets` tábla | AES-256-GCM, felhasználónkénti HKDF | Tulajdonos (API); RLS owner + service_role |
| Mesterkulcs | Folyamat-env `SECRETS_ENCRYPTION_KEY` | 32 bájt hex; nincs KMS | Üzemeltető |
| Playbook tartalom (persona, skill, memória, vászon) | Postgres | Szállítási TLS az ügyfél hatásköre | owner / editor / API-kulcs szerep |
| Audit | `audit_logs` | Nincs hash-lánc; értékeket nem tárol | Playbook tulajdonos |
| API-kulcs | SHA-256 hash + prefix | Plaintext egyszer a létrehozáskor | Tulajdonos |
| Meghívó token | SHA-256 hash, 72 óra | [`src/lib/utils.ts`](../../src/lib/utils.ts) `generateInviteToken` / `hashToken` | — |
| mTLS kliens | SHA-256 ujjlenyomat, titoknevek | Privát kulcs a kliensen marad | Tulajdonos |
| Hordozható snapshot | `playbook_snapshots` | SHA-256 digest; **nem** a széf értékei | Management API |
| Auth PII (e-mail, IdP identitás) | Supabase Auth | Ügyfél Auth-üzemeltetése | — |

**Szándékos kimenő adatfolyam (titokhasználat):** ügynök → `POST /api/playbooks/:guid/secrets/proxy` vagy MCP `use_secret` → szerveroldali visszafejtés → fejlécbe illesztés → HTTP a hívó által megadott URL-re → **csak a válasz** vissza. A napló a cél **hostnevét** tárolja, nem a teljes URL-t. Forrás: [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts).

## 5. Kriptográfia

**Állítás, amit a kód alátámaszt.**

| Tulajdonság | Implementáció | Forrás |
|-------------|---------------|--------|
| Algoritmus | Web Crypto `AES-GCM`, 256 bites kulcs, 12 bájt IV, 128 bites tag | [`src/lib/crypto.ts`](../../src/lib/crypto.ts) |
| Felhasználónkénti kulcs | HKDF-SHA-256, só = `userId`, info = `agentplaybooks-secrets-v1` | `deriveUserKey()` ugyanott |
| Mesterkulcs | `SECRETS_ENCRYPTION_KEY`, pontosan 64 hex karakter | `getMasterKeyHex()` |
| v2 ciphertext | AAD: `userId`, `playbookId`, `secretName`; prefix `v2:` | `encodeAdditionalData` |
| v1 kompatibilitás | A régi ciphertext még visszafejthető | [`src/lib/crypto.test.ts`](../../src/lib/crypto.test.ts) |
| API-kulcs at rest | SHA-256 | [`src/lib/utils.ts`](../../src/lib/utils.ts) `hashApiKey` |
| TLS (hosted) | Cloudflare edge | [`public/docs/architecture.md`](../../public/docs/architecture.md) |
| mTLS (hosted) | `cf.tlsClientAuth`; HTTP tanúsítványfejléc **nem** megbízható; `certRevoked !== "0"` elutasítva | [`src/lib/mtls.ts`](../../src/lib/mtls.ts) |
| mTLS (self-host) | `MTLS_MODE=cloudflare\|proxy\|off`; `proxy` a `MTLS_TRUSTED_PROXIES` terminátorát bízza | [`src/lib/mtls.ts`](../../src/lib/mtls.ts), [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md). **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) |
| mTLS kliensnyilvántartás | `secret_clients.certificate_sha256`, `is_active`, `expires_at`, név szerinti titoklista | [`supabase/migrations/20261010081252_secret_clients.sql`](../../supabase/migrations/20261010081252_secret_clients.sql) |

A Docker `app` image a `main`-en **nem** terminál TLS-t. Self-host tanúsítványklienshez terminátor (nginx/Caddy/Traefik) és `MTLS_MODE=proxy` kell. Enélkül a Python loader fail-closed marad (`MTLS_MODE=cloudflare`). **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201). Üzemeltetési útmutató: [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md), [`packages/python-secrets/README.md`](../../packages/python-secrets/README.md).

**Amit nem állítunk:** KMS, HSM, kulcscsomagolás, mesterkulcs-forgatás újratitkosítással. A compose kommentje: a `SECRETS_ENCRYPTION_KEY` cseréje a meglévő titkokat olvashatatlanná teszi.

Tesztek: [`src/lib/crypto.test.ts`](../../src/lib/crypto.test.ts), [`src/lib/mtls.test.ts`](../../src/lib/mtls.test.ts), [`tests/api/secret-runtime.test.ts`](../../tests/api/secret-runtime.test.ts).

## 6. Hitelesítés és hozzáférés-vezérlés

**AuthN.** Supabase Auth. A munkamenet JWT a `Authorization` fejlécben; a cookie-t a kód szándékosan nem használja sessionként ([`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts)).

A bejelentkező oldal a GoTrue `/auth/v1/settings` alapján mutatja a provideröket ([`src/lib/auth-providers.ts`](../../src/lib/auth-providers.ts)):

- e-mail / jelszó, ha engedélyezett;
- OAuth: Microsoft (`azure` / Entra ID), Google, GitHub, LinkedIn OIDC.

Self-host Entra: `GOTRUE_EXTERNAL_AZURE_*` a GoTrue konténeren, leírva: [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md).

**Nincs** alkalmazásszintű MFA (TOTP/WebAuthn). Az MFA az IdP-n (Entra) kényszeríthető — ügyféli kontroll. **Nincs** SAML; a ROADMAP Phase 4-ben szerepel.

**Emberi RBAC.** `PlaybookAccessRole = "owner" | "editor"` — [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts). Az editor nem fér a titkokhoz, API-kulcsokhoz, láthatósághoz, törléshez ([`permissions.md`](../../permissions.md)).

**Auditor szerepkör: a kódban nincs.** Amíg a `main`-en nincs, az auditnapló olvasása tulajdonos (vagy `playbooks:read` user API-kulcs) — szerkesztő és külön auditor szerep nélkül. Ez a csomag **nem** állítja, hogy az auditor szerep már létezik. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).

**API-kulcs szerepek.** `viewer`, `coworker`, `proposer`, `admin` ([`src/app/api/[[...route]]/route.ts`](../../src/app/api/[[...route]]/route.ts) `API_KEY_ROLES`, [`src/components/playbook/ApiKeyManager.tsx`](../../src/components/playbook/ApiKeyManager.tsx)). Jogosultság-sztringek: [`src/app/api/_shared/permissions.ts`](../../src/app/api/_shared/permissions.ts) `grantsPermission`.

A lejárt vagy inaktív kulcsot a lookup elutasítja ([`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts)).

## 7. Auditnaplózás

Egy tábla: `audit_logs` (korábban `mcp_proxy_audit_logs`) — [`supabase/migrations/20260819_audit_logs_secrets.sql`](../../supabase/migrations/20260819_audit_logs_secrets.sql).

Vault műveletek: `secret.create`, `secret.rotate`, `secret.update`, `secret.delete`, `secret.reveal`, `secret.use`, `secret.list`, `secret.client_create`, `secret.client_revoke`, `secret.oauth_exchange` — [`src/lib/supabase/types.ts`](../../src/lib/supabase/types.ts) `SECRET_AUDIT_OPERATIONS`. Státusz: `success` \| `denied` \| `error`. Az elutasítás is esemény.

Szabály: nincs titokérték, nincs teljes URL, nincs API-kulcs a sorban. Az írási hiba nem dönti el a vault-műveletet ([`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts)).

Olvasás: `GET /api/playbooks/:guid/audit` (legacy `GET /api/mcp/audit/:guid`), limit ≤ 500, szűrő `operation`, `secret.` prefix, `secret=` név — [`src/app/api/playbooks/[guid]/audit/app.ts`](../../src/app/api/playbooks/[guid]/audit/app.ts). Playbook API-kulccsal szándékosan nem olvasható.

**Nincs a `main`-en:** SIEM / syslog export, megőrzési job, hash-lánc. Skills / memória / vászon írások nincsenek naplózva. **Folyamatban / In progress** (export, syslog/SIEM, megőrzés, hash-lánc, auditor olvasás): [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).

## 8. Titok-lejárat és visszavonás

| Mechanizmus | Viselkedés | Forrás |
|-------------|------------|--------|
| Titok `expires_at` | Proxy, federáció, API-kulcsos reveal: elutasítva. A tulajdonos a dashboardon még olvashatja, hogy cserélhesse | [`src/lib/secret-expiry.ts`](../../src/lib/secret-expiry.ts) |
| Időzóna | Időzóna nélküli `expires_at` elutasítva | `expiresAtInput()` |
| mTLS kliens | `is_active=false` (revoke), saját `expires_at` | [`src/app/api/playbooks/[guid]/secret-clients/app.ts`](../../src/app/api/playbooks/[guid]/secret-clients/app.ts) |
| API-kulcs | `is_active` + `expires_at` a lookupban | [`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts) |
| Célhost | `allowed_hosts`; `SECRETS_REQUIRE_ALLOWED_HOSTS=true` kötelezővé teszi | [`src/lib/secret-destinations.ts`](../../src/lib/secret-destinations.ts) |
| SSRF | Privát/link-local/metadata host tiltva a proxyban és a federációnál | [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/lib/mcp/federation.ts`](../../src/lib/mcp/federation.ts) `assertSafeRemoteUrl` |

Tesztek: [`tests/api/secrets-expiry.test.ts`](../../tests/api/secrets-expiry.test.ts). Nincs háttérjob, amely a lejárt sorokat törölné.

## 9. Önálló üzemeltetés és no-egress

**Amit állíthatunk.** A [`Dockerfile`](../../Dockerfile) multi-stage, non-root, `NEXT_TELEMETRY_DISABLED=1`, healthcheck a `:3000`-on. A [`docker-compose.yml`](../../docker-compose.yml) egy `app` szolgáltatást indít (`${APP_PORT:-3000}:3000`). A jogi szöveg szerint nincs analitika-/reklám-/tracking-süti ([`src/lib/legal-copy.ts`](../../src/lib/legal-copy.ts)). Izolált no-egress CI a secrets flow-t `internal: true` Docker-hálózaton, DNS-sinkkel futtatja, és bármely kimenő csomagra elbukik — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). **Kész a `main`-en:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204). A `NO_EGRESS=true` kikapcsolja az opcionális MCP-registry keresést, hacsak a `MCP_REGISTRY_URL` belső tükör.

**Amit nem állíthatunk alapértelmezett „air-gapped / no-egress” termékként.**

1. A produkciós [`docker-compose.yml`](../../docker-compose.yml) továbbra sem tartalmazza a Supabase stacket. A no-egress bizonyíték külön [`deploy/airgap/docker-compose.yml`](../../deploy/airgap/docker-compose.yml).
2. Build-fontok: `next/font/local` Geist / Geist Mono woff2 — [`src/app/layout.tsx`](../../src/app/layout.tsx), [`src/app/fonts/Geist-Variable.woff2`](../../src/app/fonts/Geist-Variable.woff2). **Kész a `main`-en:** [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200). A build már nem tölt le Google Fonts-ot. Az `npm ci` és az alapimage-húzás a no-egress job **izolálása előtt** történik.
3. A **runtime** izolált-hálózati E2E (0 kimenő csomag) a `main`-en van. **Kész a `main`-en:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204).
4. A CSP Report-Only `connect-src` `https://*.supabase.co`-t tartalmaz ([`src/lib/security-headers.ts`](../../src/lib/security-headers.ts)); saját Auth-hostnál ez nem fedi a self-hostot, és nem enforcing.
5. A `use_secret` / federáció **szándékosan** kimenő HTTP-t indít az ügyfél által választott célokra, hacsak `allowed_hosts` / `SECRETS_REQUIRE_ALLOWED_HOSTS=true` nem pineli (az air-gap job hálózaton belüli echo hostot használ).
6. mTLS sima Docker/Node-on, terminátor nélkül fail-closed marad. A trusted-proxy mód (`MTLS_MODE=proxy`) a `main`-en van. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201).

Az ügyfél produkciós no-egress célja továbbra is a saját hálózati izoláció plusz `NO_EGRESS=true` és `SECRETS_REQUIRE_ALLOWED_HOSTS=true`. A **No egress** workflow az air-gap fixture-t méri, nem minden üzemeltetői compose-t.

HTTP-fejlécek (HSTS, `X-Frame-Options: DENY`, nosniff, Permissions-Policy): [`src/lib/security-headers.ts`](../../src/lib/security-headers.ts), [`next.config.ts`](../../next.config.ts). A CSP jelenleg Report-Only.

## 10. SDLC és ellátási lánc

| Kontroll | Van? | Hol |
|----------|------|-----|
| Dependabot (npm gyökér + CLI, heti, Europe/Budapest; Actions havi) | Igen | [`.github/dependabot.yml`](../../.github/dependabot.yml) |
| `npm audit --omit=dev --audit-level=high` a CI-ban | Igen | [`scripts/audit-production.mjs`](../../scripts/audit-production.mjs), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| CI: lint, teszt, `tsc`, worker build, wrangler dry-run | Igen | ugyanaz a workflow |
| Izolált no-egress secrets-flow CI | Igen, a `main`-en | [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). **Kész a `main`-en:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) |
| CLI npm trusted publishing / OIDC provenance | Igen | [`.github/workflows/publish-cli.yml`](../../.github/workflows/publish-cli.yml) (`id-token: write`; a `--provenance` flag szándékosan nincs, az npm automatikusan tanúsít) |
| SAST (CodeQL) | Igen, a `main`-en | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml). **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). Semgrep nincs |
| CycloneDX SBOM | Igen, a `main`-en | [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml), [`docs/security/supply-chain.md`](./supply-chain.md). **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) |
| SBOM-blob cosign `cli-v*` tageken | Igen, a `main`-en | [`docs/security/supply-chain.md`](./supply-chain.md). Nincs aláírt konténer-**registry** publikálás |
| `SECURITY.md`, incidens-runbook | Igen, a `main`-en | [`SECURITY.md`](../../SECURITY.md), [`docs/security/incident-runbook.md`](./incident-runbook.md). **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205). A PSIRT postaláda még helyőrző |
| Automatizált titkosított DB-mentés / DR-runbook | Nem a `main`-en (`supabase db dump` egy sora) | **Folyamatban / In progress** (külön PR nyitás alatt; link még nincs) |

A lockfile (`package-lock.json`, `packages/cli/package-lock.json`) a reprodukálható telepítés bemenete.

## 11. Ismert hiányosságok

Őszinte lista a beszállítói értékeléshez. Státusz a `main` 2026-10-25-i kódja szerint. A **Folyamatban / In progress** sorok még nyitott PR-ek; a **Kész a `main`-en** sorok a merge-elt PR-re hivatkoznak.

1. **Nincs KMS / HSM.** A mesterkulcs folyamat-környezeti változó.
2. **Nincs kulcsrotáció újratitkosítással.** A mesterkulcs cseréje adatvesztés a széfben.
3. **Nincs alkalmazásszintű MFA.** Az MFA csak az IdP-n (pl. Entra feltételes hozzáférés).
4. **Nincs auditor szerepkör a kódban.** Human RBAC: owner \| editor. Az audit olvasása tulajdonos-szintű. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).
5. **Nincs SAML SSO.** OIDC/OAuth a GoTrue-n keresztül, ha az ügyfél bekapcsolja.
6. **Audit: nincs export, megőrzés, hash-lánc a `main`-en.** Skills / memória / vászon írások nincsenek naplózva. **Folyamatban / In progress** (export, syslog/SIEM, megőrzés, hash-lánc): [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202).
7. **A `SECURITY.md` és a 24/72 óra / 1 hónap incidens-runbook a `main`-en van.** **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`SECURITY.md`](../../SECURITY.md), [`docs/security/incident-runbook.md`](./incident-runbook.md). A PSIRT postaláda még helyőrző. Az ügyfél NKI-bejelentése (418/2024. 77. §) saját rend — **jogi ellenőrzés szükséges**.
8. **Nincs mentés- és DR-runbook.** `supabase db dump`; playbook snapshotok nem tartalmazzák a titokértékeket. **Folyamatban / In progress:** külön PR nyitás alatt; link még nincs.
9. **A CodeQL, a CycloneDX SBOM és az SBOM-blob cosign a `main`-en van.** **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml), [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml), [`docs/security/supply-chain.md`](./supply-chain.md). Dependabot + production npm audit + CLI provenance megmarad. Aláírt konténer-**registry** publikálás továbbra sincs.
10. **A self-host mTLS trusted proxy-n a `main`-en van.** **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) — `MTLS_MODE=proxy`, [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md), [`deploy/self-host/docker-compose.mtls.yml`](../../deploy/self-host/docker-compose.mtls.yml). A Node továbbra sem terminál TLS-t; terminátor nélkül az alapértelmezés fail-closed.
11. **Az izolált no-egress CI bizonyíték a `main`-en van.** **Kész a `main`-en:** fontok [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200) (`next/font/local`); secrets-flow CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). A produkciós compose továbbra is csak az `app`. Az `npm ci` és az alapimage-húzás az izolálás előtt történik. A `use_secret` pinelés nélkül kilép a hálózatról.
12. **Rate limiting nincs** (ROADMAP).
13. **Nincs külső pentest** ebben a csomagban.
14. **CSP Report-Only**, `connect-src` hardcoded `*.supabase.co`.
15. **Az RLS nem a service_role elsődleges kontrollja**; az authz az API-rétegben van.

## 12. Felelősségmegosztás (rövid)

| Terület | Termék | Ügyfél |
|---------|--------|--------|
| Kód, kripto, RBAC, vault, audit API | Igen | — |
| Osztályba sorolás, kockázatelemzés, MK intézkedésválasztás | Sablon | IBF — **jogi ellenőrzés szükséges** |
| Entra SSO + MFA, hálózat, TLS-terminálás, fizikai védelem | Konfigpontok | Üzemeltetés |
| Naplómegőrzés, SIEM, incidensbejelentés NKI felé | Audit API + [`docs/security/incident-runbook.md`](./incident-runbook.md) | 24 / 72 óra / 1 hónap rend |
| Mentés, RPO/RTO | `db dump` + snapshotok | Restore drill |
| GDPR adatkezelő / adatfeldolgozó | Self-hoston általában az ügyfél a kezelő — **jogi ellenőrzés szükséges** | DPIA, ha kell |

Részletes leképezés: [risk-assessment.hu.md](./risk-assessment.hu.md).

## 13. Forrásindex

| Téma | Fájlok |
|------|--------|
| Kripto | `src/lib/crypto.ts`, `src/lib/crypto.test.ts` |
| mTLS | `src/lib/mtls.ts`, `src/lib/mtls.test.ts`, `supabase/migrations/20261010081252_secret_clients.sql`, `public/docs/self-hosted-mtls.md`, `deploy/self-host/docker-compose.mtls.yml` |
| Authz | `src/app/api/_shared/guards.ts`, `src/app/api/_shared/permissions.ts`, `src/app/api/_shared/auth.ts`, `permissions.md` |
| Audit | `src/app/api/_shared/audit.ts`, `src/app/api/playbooks/[guid]/audit/app.ts`, `supabase/migrations/20260819_audit_logs_secrets.sql` |
| Lejárat / SSRF | `src/lib/secret-expiry.ts`, `src/lib/secret-destinations.ts`, `src/lib/mcp/federation.ts` |
| Self-host | `docker-compose.yml`, `Dockerfile`, `public/docs/self-hosting.md`, `src/app/fonts/Geist-Variable.woff2`, `deploy/airgap/`, `.github/workflows/no-egress.yml` |
| SDLC | `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/publish-cli.yml`, `.github/workflows/codeql.yml`, `.github/workflows/sbom.yml`, `.github/workflows/no-egress.yml`, `scripts/audit-production.mjs`, `SECURITY.md`, `docs/security/incident-runbook.md`, `docs/security/supply-chain.md` |
| Élő leltár | `scripts/list-self-host-stack.mjs` |
