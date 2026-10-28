# AgentPlaybooks biztonsági fehérkönyv

**Verzió:** 2026-10-28 · **Forrás:** a repó `main` ágának akkor aktuális kódja (benne a merge-elt [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200), [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201), [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202), [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203), [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204), [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205), [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207), [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [#220](https://github.com/matebenyovszky/agentplaybooks/pull/220)). Státuszjelölés: a még nyitott PR-ből származó tétel **Folyamatban / In progress** jelölést kap, és merge előtt nem számít késznek; csak merge-elt biztonsági változások számítanak késznek.
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
| TB-3 Kimenő proxy | `use_secret` és federált eszközök | Az ügynök nem látja a titkot, de a célt ő választja; `allowed_hosts` + belső cím tiltás. Egy közös ellenőrzés DNS-feloldással: **Kész a `main`-en** ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts)) |
| TB-4 mTLS | Hosted: `cf.tlsClientAuth`. Self-host: `MTLS_MODE=proxy` megbízható terminátor mögött | A Node nem terminál TLS-t. Terminátor nélkül az alapértelmezés fail-closed. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) |

A compose **nem** indít adatbázist. `docker-compose.yml` ezt kimondja; a bare Postgres nem elég, mert minden útvonal a Supabase Data API-t és Auth-ot hívja. Lásd [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md), [`docker-compose.yml`](../../docker-compose.yml).

A service_role megkerüli az RLS-t. Az engedélyezés az alkalmazáskódban van: [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts), [`supabase/README.md`](../../supabase/README.md).

## 4. Adatfolyamok és adatosztályok

| Adatosztály | Hol van | Titkosítás / kezelés | Ki fér hozzá |
|-------------|---------|----------------------|--------------|
| Titok plaintext | Csak memóriában, proxy/reveal közben | Nincs at rest | Alkalmazásfolyamat |
| Titok ciphertext | `secrets` tábla | AES-256-GCM, felhasználónkénti HKDF | Tulajdonos/editor az engedélyezett API-n; közvetlen RLS owner + service_role |
| Mesterkulcs | Folyamat-env `SECRETS_ENCRYPTION_KEY` | 32 bájt hex; nincs KMS | Üzemeltető |
| Playbook tartalom (persona, skill, memória, vászon) | Postgres | Szállítási TLS az ügyfél hatásköre | owner / editor / API-kulcs szerep |
| Audit | `audit_logs`, `audit_chain_checkpoints` | Playbookonkénti SHA-256 hash-lánc (kulcs nélküli); titokértéket nem tárol | Playbook tulajdonos, auditor |
| API-kulcs | SHA-256 hash + prefix | Plaintext egyszer a létrehozáskor | Tulajdonos |
| Meghívó token | SHA-256 hash, 72 óra | [`src/lib/utils.ts`](../../src/lib/utils.ts) `generateInviteToken` / `hashToken` | — |
| mTLS kliens | SHA-256 ujjlenyomat, titoknevek | Privát kulcs a kliensen marad | Tulajdonos |
| Hordozható snapshot | `playbook_snapshots` | SHA-256 digest; **nem** a széf értékei | Management API |
| Auth PII (e-mail, IdP identitás) | Supabase Auth | Ügyfél Auth-üzemeltetése | — |

**Szándékos kimenő adatfolyam (titokhasználat):** ügynök → `POST /api/playbooks/:guid/secrets/proxy` vagy MCP `use_secret` → szerveroldali visszafejtés → fejlécbe illesztés → HTTP a hívó által megadott URL-re → **csak a válasz** vissza. A napló a cél **hostnevét** tárolja, nem a teljes URL-t. A [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) óta (**Kész a `main`-en**) a célnevet küldés előtt fel is oldja, és elutasítja, ha bármely címe belső ([`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts)). Forrás: [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts).

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

**Nincs** alkalmazásszintű MFA (TOTP/WebAuthn): az alkalmazás nem ellenőrzi a munkamenet `aal` szintjét. Az MFA az IdP-n (Entra feltételes hozzáférés) kényszeríthető — ügyféli kontroll. **Nincs** SAML; a ROADMAP Phase 4-ben szerepel.

**Emberi RBAC.** A központi szerepkörmodell `owner | editor | auditor` ([`src/lib/audit-access.ts`](../../src/lib/audit-access.ts), [`src/app/api/_shared/guards.ts`](../../src/app/api/_shared/guards.ts)). Az editor szerkeszthet tartalmat, kezelhet titkokat és láthatja az API-kulcsok metaadatait. A kulcsok módosítása, a láthatóság, megosztás és törlés tulajdonosi jog. Az auditor auditbizonyítékot és playbook-metaadatot olvashat; titkot és tartalommásolási jogot nem kap ([`permissions.md`](../../permissions.md)).

**Auditor szerepkör: kész a `main`-en** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). Együttműködő meghívható `auditor` szerepre, és playbook API-kulcs kaphat `auditor` szerepet (alapértelmezett jogosultságok: `audit:read`, `playbooks:read`). Az auditor olvassa és exportálja az auditnaplót, és csak a playbook metaadatait látja (név, leírás, láthatóság, dátumok, címkék); személyiséget, skillt, szervert, titkot nem, írni nem tud ([`src/lib/audit-access.ts`](../../src/lib/audit-access.ts), [`supabase/migrations/20261024120000_audit_logs_compliance.sql`](../../supabase/migrations/20261024120000_audit_logs_compliance.sql)). Tesztek: [`tests/api/audit-role.test.ts`](../../tests/api/audit-role.test.ts).

**API-kulcs szerepek.** `viewer`, `coworker`, `proposer`, `admin`, `auditor` ([`src/app/api/[[...route]]/route.ts`](../../src/app/api/[[...route]]/route.ts) `API_KEY_ROLES`, [`src/components/playbook/ApiKeyManager.tsx`](../../src/components/playbook/ApiKeyManager.tsx)). Jogosultság-sztringek: [`src/app/api/_shared/permissions.ts`](../../src/app/api/_shared/permissions.ts) `grantsPermission`. A szerepet létrehozáskor ellenőrzi; a `permissions` tömböt úgy tárolja, ahogy érkezett, ismert sztringekhez nem veti össze. Az `expires_at` opcionális.

A lejárt vagy inaktív kulcsot a lookup elutasítja. A [#227](https://github.com/matebenyovszky/agentplaybooks/pull/227) óta minden hitelesített kérés ellenőrzi a fiók aktivitását: a letiltott vagy törölt fiók API-kulcsa, munkamenete és mTLS-hozzáférése elutasított. Ellenőrzési hiba esetén is tiltás történik. Az üzemeltető a `revoke_account_credentials` service-role függvénnyel visszavonhatja a hitelesítő adatokat; instance-admin felület nincs ([`src/app/api/_shared/account-status.ts`](../../src/app/api/_shared/account-status.ts), [`scripts/self-host/offboard-user.py`](../../scripts/self-host/offboard-user.py)).

A `/api/mcp/manage` bármely érvényes Supabase munkamenet-JWT-t `full` jogosultságként kezel; az OAuth scope-okat nem ellenőrzi ([`src/app/api/mcp/manage/route.ts`](../../src/app/api/mcp/manage/route.ts)).

**Kész a `main`-en ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)) — ki irányíthat vagy tehet közzé titkot:**

- Az `allow_api_key_reveal` bekapcsolása és a titok `allowed_hosts` listájának bővítése csak tulajdonosi vagy editor munkamenetből lehetséges. API-kulcs a reveal-t nem kapcsolhatja be, az `allowed_hosts` listát csak szűkítheti, nem bővítheti és nem törölheti (REST és MCP `store_secret`) — [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/lib/secret-destinations.ts`](../../src/lib/secret-destinations.ts) `narrowsAllowedHosts`.
- Széftitokra hivatkozó MCP-szerver konfiguráció írásához a playbook tulajdonosa vagy `secrets:read` jogú kulcs kell (REST catch-all, MCP `create_mcp_server` / `update_mcp_server`, `/api/mcp/config/:id`) — [`src/app/api/_shared/federation-secrets.ts`](../../src/app/api/_shared/federation-secrets.ts) `configReferencesSecrets`, `userMayRouteSecrets`.
- Az `access: "public"` jelölésű, széftitokra hivatkozó szerver névtelenül már nem hívható (`anonymousMayCall`).
- A nyilvános MCP-listák nem adják ki a fejlécértékeket és az URL query stringeket ([`src/lib/mcp/public-transport-config.ts`](../../src/lib/mcp/public-transport-config.ts)).
- Playbookhoz kötött API-kulcs nem teheti a playbookot nyilvánossá vagy unlisted-dé (MCP `update_playbook`, [`src/app/api/mcp/[guid]/route.ts`](../../src/app/api/mcp/[guid]/route.ts)).
- Privát instance kapcsoló: az `ALTER DATABASE postgres SET agentplaybooks.private_instance = 'on'` után egy trigger a `private`-on kívül minden láthatóságot elutasít, így bejelentkezés nélkül semmi sem olvasható. A hivatalos self-hosted Supabase image-en a `postgres` szerep ezt a paramétert nem állíthatja: az utasítást `supabase_admin`-ként kell futtatni (`psql -U supabase_admin`), utána a PostgREST-et újra kell indítani, hogy a poolozott kapcsolatai átvegyék. A meglévő nyilvános playbookokat kézzel kell priváttá tenni ([`supabase/migrations/20261025140000_private_instance.sql`](../../supabase/migrations/20261025140000_private_instance.sql), [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md)).

## 7. Auditnaplózás

Egy tábla: `audit_logs` (korábban `mcp_proxy_audit_logs`) — [`supabase/migrations/20260819_audit_logs_secrets.sql`](../../supabase/migrations/20260819_audit_logs_secrets.sql). Üzemeltetői útmutató: [`public/docs/audit-logs.hu.md`](../../public/docs/audit-logs.hu.md).

**Amit a `main` naplóz.** Vault műveletek: `secret.create`, `secret.rotate`, `secret.update`, `secret.delete`, `secret.reveal`, `secret.use`, `secret.list`, `secret.client_create`, `secret.client_revoke`, `secret.oauth_exchange` — [`src/lib/supabase/types.ts`](../../src/lib/supabase/types.ts) `SECRET_AUDIT_OPERATIONS`. Federált MCP-hívások. `audit.retention_purge`. Státusz: `success` \| `denied` \| `error`. Az elutasítás is esemény.

Szabály: nincs titokérték, teljes URL vagy API-kulcs a sorban. A [#227](https://github.com/matebenyovszky/agentplaybooks/pull/227) óta a plaintext reveal/resolve csak sikeres auditírás után adja ki az értéket; naplózási hiba esetén a titok nem kerül ki. Más auditírások továbbra is fail-open módon működnek; a SIEM-továbbítás külön, best-effort művelet ([`src/app/api/_shared/audit.ts`](../../src/app/api/_shared/audit.ts)).

**Hash-lánc — kész a `main`-en** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). Egy adatbázis-trigger minden sorhoz `prev_hash`-t és `hash`-t ad (a sor kanonikus JSON-jának SHA-256-ja), playbookonként egy lánccal. Az UPDATE tiltott. A megőrzési purge checkpointot ír az `audit_chain_checkpoints` táblába, így a maradék lánc ellenőrizhető marad. Ellenőrzés: `GET /api/playbooks/:guid/audit/verify` vagy [`scripts/verify-audit-hash-chain.ts`](../../scripts/verify-audit-hash-chain.ts) — [`supabase/migrations/20261024120000_audit_logs_compliance.sql`](../../supabase/migrations/20261024120000_audit_logs_compliance.sql), [`src/lib/audit-chain.ts`](../../src/lib/audit-chain.ts). A lánc **kulcs nélküli** SHA-256: aki írhat az adatbázisba, egy sor módosítása után az összes későbbi hasht újraszámolhatja. Azt mutatja ki, amit adatbázis-írási jog nélkül módosítottak, vagy ami eltér egy máshol tárolt másolattól (syslog / SIEM). Nem aláírás.

**Olvasás és export — kész a `main`-en** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). `GET /api/playbooks/:guid/audit` (legacy `GET /api/mcp/audit/:guid`), JSON-ban limit ≤ 500; `GET /api/playbooks/:guid/audit/export?format=json|jsonl|csv`, legfeljebb 10 000 sor; szűrő `operation` (vagy `secret.` prefix) és `secret=` név — [`src/app/api/playbooks/[guid]/audit/app.ts`](../../src/app/api/playbooks/[guid]/audit/app.ts). Tulajdonos vagy auditor. Playbook API-kulccsal csak `auditor` szereppel olvasható; user API-kulcshoz `audit:read` vagy `playbooks:read` kell.

**Továbbítás — kész a `main`-en, alapból kikapcsolva** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). `AUDIT_SYSLOG_URL`: RFC 5424, `udp://`, `tcp://` vagy `tls://`. `AUDIT_SIEM_WEBHOOK_URL`: HTTPS POST HMAC-SHA256 aláírással (`AUDIT_SIEM_WEBHOOK_SECRET`, legalább 32 véletlen bájt). Három próbálkozás visszalépéssel, utána a továbbított másolat elveszik, a hiba a szervernaplóba kerül. Nincs outbox: a próbálkozásoknál hosszabb SIEM-kiesés továbbított másolatokat veszít (az adatbázissor megmarad) — [`src/app/api/_shared/audit-forward.ts`](../../src/app/api/_shared/audit-forward.ts). Csak az alkalmazás által írt sorokat továbbítja.

**Megőrzés — kész a `main`-en** ([#202](https://github.com/matebenyovszky/agentplaybooks/pull/202)). Alapértelmezés: örök megőrzés. `AUDIT_RETENTION_DAYS` plusz `POST /api/cron/audit-purge` (Bearer `AUDIT_CRON_SECRET` vagy `CRON_SECRET`) — a hívást az üzemeltetőnek kell ütemeznie ([`src/app/api/cron/audit-purge/route.ts`](../../src/app/api/cron/audit-purge/route.ts)). A tulajdonos egy playbookot külön is törölhet: `POST /api/playbooks/:guid/audit/purge`, `{ days }`. A purge a lánc elejét távolítja el, checkpointot és `audit.retention_purge` sort ír.

**Manipuláció elleni védelem — Kész a `main`-en** ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [`supabase/migrations/20261025124500_audit_logs_tamper_resistance.sql`](../../supabase/migrations/20261025124500_audit_logs_tamper_resistance.sql)):

- Az `audit_logs` és az `audit_chain_checkpoints` táblán nincs idegen kulcs. Korábban az `ON DELETE CASCADE` törölte a törölt playbook (és a playbookjain keresztül a törölt fiók) naplóját, az MCP-szerver törlése pedig a hívásai sorait, és eltörte a láncot.
- Az `audit_logs` DELETE-je tiltott, kivéve a `purge_audit_logs` belsejéből (tranzakció-lokális jelző). A TRUNCATE mindkét táblán tiltott. A checkpointok nem módosíthatók és nem törölhetők.
- Az `anon`, `authenticated` és `service_role` elveszti az UPDATE, DELETE és TRUNCATE jogot mindkét táblán.
- Adatbázis-superuser továbbra is kikapcsolhatja a triggereket. Ezt a külső syslog / SIEM továbbítás teszi észlelhetővé.

Tesztek: [`tests/audit-tamper-resistance-db.test.ts`](../../tests/audit-tamper-resistance-db.test.ts).

**Konfigurációváltozások — Kész a `main`-en** ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [`supabase/migrations/20261025130000_audit_config_changes.sql`](../../supabase/migrations/20261025130000_audit_config_changes.sql)). Triggerek naplózzák: `playbook.create` / `update` / `visibility` / `delete`, `skill.create` / `update` / `delete`, `mcp_server.create` / `update` / `delete`, `api_key.create` / `update` / `rotate` / `revoke` / `delete`, `collaborator.invite` / `accept` / `update` / `remove`. Mivel triggerek, minden írási utat fednek, a közvetlen Data API írást is. A `target` az objektumot és a megváltozott oszlopokat nevezi meg. Értéket csak hozzáférés-vezérlési oszlopokra rögzít (`visibility`, `role`, `permissions`, `is_active`, `expires_at`, és a szerver `transport_type`-ja); utasítást, skill-tartalmat, kulcs- és meghívó-hasht nem másol. A szereplő az `x-apb-actor` fejlécből jön, amelyet az alkalmazás a hívó hitelesítése után állít be ([`src/lib/audit-context.ts`](../../src/lib/audit-context.ts), [`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts)), és csak `service_role` kérésen megbízható; különben a JWT `sub`; különben `system` és az adatbázis-szerep. Tesztek: [`tests/audit-config-changes-db.test.ts`](../../tests/audit-config-changes-db.test.ts), [`tests/lib/audit-context.test.ts`](../../tests/lib/audit-context.test.ts).

**Nyitott marad:**

- A skill-, memória- és vászonírásokat adatbázis-triggerek naplózzák ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216), [#222](https://github.com/matebenyovszky/agentplaybooks/pull/222)). A memória `memory_history` táblája külön verziótörténet. Nem lefedett: fiókszintű user API-kulcsok, bejelentkezések és az auditnapló olvasása/exportja.
- A triggerek által írt sorokat az alkalmazás nem továbbítja syslogra / SIEM-be; a továbbító csak az alkalmazás által írt sorokat küldi.
- Nincs forrás IP és user-agent oszlop.
- A plaintext reveal/resolve auditírása fail-closed; más alkalmazás-auditírások fail-open működésűek.

## 8. Titok-lejárat és visszavonás

| Mechanizmus | Viselkedés | Forrás |
|-------------|------------|--------|
| Titok `expires_at` | Proxy, federáció, API-kulcsos reveal: elutasítva. A tulajdonos a dashboardon még olvashatja, hogy cserélhesse | [`src/lib/secret-expiry.ts`](../../src/lib/secret-expiry.ts) |
| Időzóna | Időzóna nélküli `expires_at` elutasítva | `expiresAtInput()` |
| mTLS kliens | `is_active=false` (revoke), saját `expires_at` | [`src/app/api/playbooks/[guid]/secret-clients/app.ts`](../../src/app/api/playbooks/[guid]/secret-clients/app.ts) |
| API-kulcs | `is_active` + `expires_at` a lookupban | [`src/app/api/_shared/auth.ts`](../../src/app/api/_shared/auth.ts) |
| Célhost | `allowed_hosts`; `SECRETS_REQUIRE_ALLOWED_HOSTS=true` kötelezővé teszi. **Kész a `main`-en** ([#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)): a mellékelt [`docker-compose.yml`](../../docker-compose.yml) alapértelmezése `true` | [`src/lib/secret-destinations.ts`](../../src/lib/secret-destinations.ts) |
| SSRF (a #216 előtt) | Privát/link-local/metadata host tiltva a proxyban és a federációnál | [`src/app/api/playbooks/[guid]/secrets/app.ts`](../../src/app/api/playbooks/[guid]/secrets/app.ts), [`src/lib/mcp/federation.ts`](../../src/lib/mcp/federation.ts) `assertSafeRemoteUrl` |
| SSRF (**Kész a `main`-en**, [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)) | Egy ellenőrzés a `use_secret`, a titok-proxy és a federáció számára: minden belső IPv4/IPv6 tartomány, a `::ffff:` hex alakokkal, NAT64-gyel, 6to4-gyel és CGNAT-tal, valamint az egycímkés és belső nevek. Node-ban a nevet küldés előtt feloldja, és elutasítja, ha bármely címe belső (`OUTBOUND_DNS_CHECK`, alapból bekapcsolva); Cloudflare-en ezt a runtime `global_fetch_strictly_public` beállítása végzi. Maradék kockázat: DNS rebinding az ellenőrzés és a kapcsolódás között — hálózati egress-szabály kell | [`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts), [`tests/lib/outbound-destination.test.ts`](../../tests/lib/outbound-destination.test.ts) |
| Átirányítás (**Kész a `main`-en**, [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)) | A federáció `redirect: "manual"` móddal kér; 3xx választ elutasít (`UPSTREAM_REDIRECT`) | [`src/lib/mcp/federation.ts`](../../src/lib/mcp/federation.ts) `timedFetch` |
| Federációs pinelés (**Kész a `main`-en**, [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216)) | Az `allowed_hosts` az `auth.token_url`-re és az OpenAPI `servers` címekre is vonatkozik; ismeretlen alap-URL-ű spec esetén a pinelt titok nem megy ki | [`src/app/api/_shared/federation-secrets.ts`](../../src/app/api/_shared/federation-secrets.ts) `serverDestinations` |

Tesztek: [`tests/api/secrets-expiry.test.ts`](../../tests/api/secrets-expiry.test.ts). Nincs háttérjob, amely a lejárt sorokat törölné.

## 9. Önálló üzemeltetés és no-egress

**Amit állíthatunk.** A [`Dockerfile`](../../Dockerfile) multi-stage, non-root, `NEXT_TELEMETRY_DISABLED=1`, healthcheck a `:3000`-on. A [`docker-compose.yml`](../../docker-compose.yml) egy `app` szolgáltatást indít (`${APP_PORT:-3000}:3000`). A jogi szöveg szerint nincs analitika-/reklám-/tracking-süti ([`src/lib/legal-copy.ts`](../../src/lib/legal-copy.ts)). Izolált no-egress CI a secrets flow-t `internal: true` Docker-hálózaton, DNS-sinkkel futtatja, és bármely kimenő csomagra elbukik — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). **Kész a `main`-en:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204). A `NO_EGRESS=true` kikapcsolja az opcionális MCP-registry keresést, hacsak a `MCP_REGISTRY_URL` belső tükör.

**Amit nem állíthatunk alapértelmezett „air-gapped / no-egress” termékként.**

1. A produkciós [`docker-compose.yml`](../../docker-compose.yml) továbbra sem tartalmazza a Supabase stacket. A no-egress bizonyíték külön [`deploy/airgap/docker-compose.yml`](../../deploy/airgap/docker-compose.yml).
2. Build-fontok: `next/font/local` Geist / Geist Mono woff2 — [`src/app/layout.tsx`](../../src/app/layout.tsx), [`src/app/fonts/Geist-Variable.woff2`](../../src/app/fonts/Geist-Variable.woff2). **Kész a `main`-en:** [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200). A build már nem tölt le Google Fonts-ot. Az `npm ci` és az alapimage-húzás a no-egress job **izolálása előtt** történik.
3. A **runtime** izolált-hálózati E2E (0 kimenő csomag) a `main`-en van. **Kész a `main`-en:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204).
4. A CSP kikényszerített, és a `NEXT_PUBLIC_SUPABASE_URL` alapján a saját Auth-hostot is támogatja ([`src/lib/security-headers.ts`](../../src/lib/security-headers.ts), [#219](https://github.com/matebenyovszky/agentplaybooks/pull/219)). A `connect-src` önmagában nem hálózati egress-szabály.
5. A `use_secret` / federáció **szándékosan** kimenő HTTP-t indít az ügyfél által választott célokra, hacsak `allowed_hosts` / `SECRETS_REQUIRE_ALLOWED_HOSTS=true` nem pineli (az air-gap job hálózaton belüli echo hostot használ). A [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) óta (**Kész a `main`-en**) a compose alapértelmezése `true` — lásd [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md).
6. mTLS sima Docker/Node-on, terminátor nélkül fail-closed marad. A trusted-proxy mód (`MTLS_MODE=proxy`) a `main`-en van. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201).

Az ügyfél produkciós no-egress célja továbbra is a saját hálózati izoláció plusz `NO_EGRESS=true` és `SECRETS_REQUIRE_ALLOWED_HOSTS=true`. A **No egress** workflow az air-gap fixture-t méri, nem minden üzemeltetői compose-t.

HTTP-fejlécek (HSTS, `X-Frame-Options: DENY`, nosniff, Permissions-Policy): [`src/lib/security-headers.ts`](../../src/lib/security-headers.ts), [`next.config.ts`](../../next.config.ts). A CSP kikényszerített; az inline szkriptek és eval még megengedettek.

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
| `SECURITY.md`, incidens-runbook | Igen, a `main`-en | [`SECURITY.md`](../../SECURITY.md), [`docs/security/incident-runbook.md`](./incident-runbook.md). **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) (runbook), [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207) (a biztonsági kapcsolat kizárólag a GitHub privát sérülékenység-jelentés; nincs security e-mail). A maintainer-review best-effort; a 24/72 órás órák üzemeltetői kötelezettségek, nem bejelentői SLA |
| Titkosított helyszíni mentés / restore + üres-gép drill | Igen, a `main`-en | [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md), [`scripts/self-host/backup.sh`](../../scripts/self-host/backup.sh), [`.github/workflows/self-host-restore-drill.yml`](../../.github/workflows/self-host-restore-drill.yml). **Kész a `main`-en:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203). A mesterkulcs külön tárolt. A drill futtatja a hash-lánc ellenőrzőt, ha jelen van; a [`scripts/verify-audit-hash-chain.ts`](../../scripts/verify-audit-hash-chain.ts) a [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) óta a `main`-en van |

A lockfile (`package-lock.json`, `packages/cli/package-lock.json`) a reprodukálható telepítés bemenete.

## 11. Ismert hiányosságok

Őszinte lista a beszállítói értékeléshez. Státusz a `main` 2026-10-28-i kódja szerint. A **Folyamatban / In progress** jelölés a még nyitott PR-ek tételeit jelölné (csak merge-elt biztonsági változások számítanak késznek); a **Kész a `main`-en** sorok a merge-elt PR-re hivatkoznak.

1. **Nincs KMS / HSM.** A mesterkulcs folyamat-környezeti változó.
2. **Nincs kulcsrotáció újratitkosítással.** A mesterkulcs cseréje adatvesztés a széfben.
3. **Nincs alkalmazásszintű MFA.** Az alkalmazás nem ellenőrzi a munkamenet `aal` szintjét. Az MFA csak az IdP-n (pl. Entra feltételes hozzáférés).
4. **Auditor szerepkör: kész a `main`-en.** **Kész a `main`-en:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) — `auditor` együttműködői és API-kulcs szerep; audit olvasás/export és playbook-metaadat, titok, tartalommásolás és írás nélkül ([`src/lib/audit-access.ts`](../../src/lib/audit-access.ts)). Az auditjog nem tartalomhozzáférés; külön átadott ügynökkulcsokat külön kell visszavonni.
5. **Nincs SAML SSO.** OIDC/OAuth a GoTrue-n keresztül, ha az ügyfél bekapcsolja.
6. **Az audit export, megőrzés, hash-lánc és syslog/SIEM továbbítás a `main`-en van.** **Kész a `main`-en:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202). Korlátok: a lánc kulcs nélküli SHA-256; a továbbítás alapból ki van kapcsolva, és 3 próbálkozás után eldobja a másolatot (nincs outbox); a megőrzéshez üzemeltetői ütemezés kell. **Kész a `main`-en:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) — a napló túléli a playbook, szerver vagy fiók törlését; DELETE / TRUNCATE tiltva; a konfigurációváltozásokat triggerek naplózzák. A memória- és vászonírások is naplózottak (#222). Nyitott: user API-kulcsok, bejelentkezések és az auditnapló olvasása nincs naplózva; a triggerek sorai nincsenek továbbítva; nincs forrás IP / user-agent; a reveal/resolve auditírás fail-closed, más auditírás fail-open.
7. **A `SECURITY.md` és a 24/72 óra / 1 hónap incidens-runbook a `main`-en van.** **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`SECURITY.md`](../../SECURITY.md), [`docs/security/incident-runbook.md`](./incident-runbook.md). A biztonsági kapcsolat kizárólag a GitHub privát sérülékenység-jelentés (**Kész a `main`-en:** [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207)); nincs security e-mail. A maintainer-review best-effort. A 24/72 óra / 1 hónap órák a 418/2024. 77. § szerinti üzemeltetői kötelezettségek, nem bejelentői SLA. Az ügyfél NKI-bejelentése saját rend — **jogi ellenőrzés szükséges**.
8. **A helyszíni mentés / restore-runbook és az üres-gép drill a `main`-en van.** **Kész a `main`-en:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) — [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md), [`scripts/self-host/backup.sh`](../../scripts/self-host/backup.sh), [`scripts/self-host/restore-drill.sh`](../../scripts/self-host/restore-drill.sh), [`.github/workflows/self-host-restore-drill.yml`](../../.github/workflows/self-host-restore-drill.yml). A [#227](https://github.com/matebenyovszky/agentplaybooks/pull/227) óta az AES-256-CBC/PBKDF2 archívumot külön kulcsú HMAC-SHA256 védi; az ellenőrzés a visszafejtés előtt történik. A régi, hitelesítés nélküli archívumhoz `BACKUP_ALLOW_UNSEALED=1` kell. A `--no-encrypt` továbbra is üzemeltetői választás. A `SECRETS_ENCRYPTION_KEY` nincs az archívumban. A playbook snapshotok továbbra sem tartalmazzák a széf értékeit. A drill futtatja a hash-lánc ellenőrzőt, amely a [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) óta a `main`-en van.
9. **A CodeQL, a CycloneDX SBOM és az SBOM-blob cosign a `main`-en van.** **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml), [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml), [`docs/security/supply-chain.md`](./supply-chain.md). Dependabot + production npm audit + CLI provenance megmarad. Aláírt konténer-**registry** publikálás továbbra sincs.
10. **A self-host mTLS trusted proxy-n a `main`-en van.** **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) — `MTLS_MODE=proxy`, [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md), [`deploy/self-host/docker-compose.mtls.yml`](../../deploy/self-host/docker-compose.mtls.yml). A Node továbbra sem terminál TLS-t; terminátor nélkül az alapértelmezés fail-closed.
11. **Az izolált no-egress CI bizonyíték a `main`-en van.** **Kész a `main`-en:** fontok [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200) (`next/font/local`); secrets-flow CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/). A produkciós compose továbbra is csak az `app`. Az `npm ci` és az alapimage-húzás az izolálás előtt történik. A `use_secret` pinelés nélkül kilép a hálózatról.
12. **Rate limiting nincs** (ROADMAP).
13. **Nincs külső pentest** ebben a csomagban.
14. **Kikényszerített CSP, fennmaradó engedményekkel.** A saját Auth-origin támogatott; az `unsafe-inline` / `unsafe-eval` és a report-gyűjtés hiánya maradék hiány.
15. **Az RLS nem a service_role elsődleges kontrollja**; az authz az API-rétegben van.
16. **SSRF maradék kockázat: DNS rebinding.** **Kész a `main`-en:** a [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) egy közös, DNS-feloldó célellenőrzést hozott ([`src/lib/outbound-destination.ts`](../../src/lib/outbound-destination.ts)). Ha a név válasza az ellenőrzés és a kapcsolódás között változik, azt nem fedi; erre az alkalmazás-konténer hálózati egress-szabálya a kontroll.
17. **API-kulcs: a lejárat opcionális, a jogosultság-sztringeket a szerver nem ellenőrzi.** Az `expires_at` nélküli kulcs sosem jár le. A `permissions` tömb úgy tárolódik, ahogy érkezett.
18. **A `/api/mcp/manage` bármely érvényes Supabase JWT-nek `full` jogot ad.** Az OAuth scope-okat figyelmen kívül hagyja.
19. **Kiléptetés és fiókellenőrzés: kész a `main`-en.** [#227](https://github.com/matebenyovszky/agentplaybooks/pull/227): inaktív fiók hitelesítő adatai a következő kérésen elutasítottak; üzemeltetői visszavonás lehetséges. Instance-admin felület nincs.
20. **CORS-visszaesés.** **Kész a `main`-en:** [#220](https://github.com/matebenyovszky/agentplaybooks/pull/220) — ha az `ALLOWED_ORIGINS` nincs beállítva, a self-hosted `NEXT_PUBLIC_APP_URL` az egyetlen megbízható origin; a hosted originek már nem kerülnek mellé. Maradék: ha sem az `ALLOWED_ORIGINS`, sem a `NEXT_PUBLIC_APP_URL` nincs beállítva, az allow-list a hosted originek listája ([`src/app/api/_shared/hono.ts`](../../src/app/api/_shared/hono.ts)).
21. **Nincs konténer-keményítés a compose-ban.** Nincs `read_only`, `cap_drop`, image digest pinelés; nincs image-szkennelés és -aláírás.
22. **Üzemeltetési naplózás.** Nincs access log; az alkalmazás nem generál kérésazonosítót (a beérkező `x-request-id` / `cf-ray` értéket viszi tovább); nincs naplótovábbítási útmutató.
23. **Nincs alapértelmezett-titok ellenőrzés a self-hosted Supabase-hez.** Az alkalmazás nem ismeri fel a Supabase-telepítés példa JWT-titkát vagy kulcsait.
24. **Prompt-injection és integritás.** Skill- és személyiség-változáshoz nem kell jóváhagyás. Bármely kulcs, amely memóriát vagy skillt írhat, az adott fajta javaslatot jóvá is hagyhatja ([`src/app/api/playbooks/[guid]/proposals/reviewer.ts`](../../src/app/api/playbooks/[guid]/proposals/reviewer.ts)).
25. **Titok-útválasztás és -közzététel.** **Kész a `main`-en:** [#216](https://github.com/matebenyovszky/agentplaybooks/pull/216) — API-kulcs nem kapcsolhat be reveal-t és nem bővítheti az `allowed_hosts`-ot; titokra hivatkozó MCP-konfighoz tulajdonos vagy `secrets:read` kell; a titkot használó `access: "public"` szerverhez hitelesítés kell; a nyilvános listák nem adják ki a fejlécértékeket és query stringeket; playbook-kulcs nem tehet közzé playbookot; privát instance kapcsoló (a hivatalos Supabase image-en `supabase_admin`-ként, utána PostgREST-újraindítás).

## 12. Felelősségmegosztás (rövid)

| Terület | Termék | Ügyfél |
|---------|--------|--------|
| Kód, kripto, RBAC, vault, audit API | Igen | — |
| Osztályba sorolás, kockázatelemzés, MK intézkedésválasztás | Sablon | IBF — **jogi ellenőrzés szükséges** |
| Entra SSO + MFA, hálózat, TLS-terminálás, fizikai védelem | Konfigpontok | Üzemeltetés |
| Naplómegőrzés, SIEM, incidensbejelentés NKI felé | Audit API, export, hash-lánc ellenőrzés, opcionális syslog / SIEM továbbítás, megőrzési végpont + [`docs/security/incident-runbook.md`](./incident-runbook.md) | A purge ütemezése, a syslog / SIEM fogadó üzemeltetése, a GoTrue saját naplójának továbbítása, 24 / 72 óra / 1 hónap rend |
| Mentés, RPO/RTO | [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md) + titkosított archívum + CI drill | Ütemezés, offsite másolat, mesterkulcs-őrzés, mért RTO |
| GDPR adatkezelő / adatfeldolgozó | Self-hoston általában az ügyfél a kezelő — **jogi ellenőrzés szükséges** | DPIA, ha kell |

Részletes leképezés: [risk-assessment.hu.md](./risk-assessment.hu.md).

## 13. Forrásindex

| Téma | Fájlok |
|------|--------|
| Kripto | `src/lib/crypto.ts`, `src/lib/crypto.test.ts` |
| mTLS | `src/lib/mtls.ts`, `src/lib/mtls.test.ts`, `supabase/migrations/20261010081252_secret_clients.sql`, `public/docs/self-hosted-mtls.md`, `deploy/self-host/docker-compose.mtls.yml` |
| Authz | `src/app/api/_shared/guards.ts`, `src/app/api/_shared/permissions.ts`, `src/app/api/_shared/auth.ts`, `src/lib/audit-access.ts`, `src/app/api/_shared/federation-secrets.ts`, `src/lib/mcp/public-transport-config.ts`, `supabase/migrations/20261025140000_private_instance.sql`, `permissions.md` |
| Audit | `src/app/api/_shared/audit.ts`, `src/app/api/_shared/audit-forward.ts`, `src/lib/audit-chain.ts`, `src/lib/audit-context.ts`, `src/app/api/playbooks/[guid]/audit/app.ts`, `src/app/api/cron/audit-purge/route.ts`, `supabase/migrations/20260819_audit_logs_secrets.sql`, `supabase/migrations/20261024120000_audit_logs_compliance.sql`, `supabase/migrations/20261025124500_audit_logs_tamper_resistance.sql`, `supabase/migrations/20261025130000_audit_config_changes.sql` |
| Lejárat / SSRF | `src/lib/secret-expiry.ts`, `src/lib/secret-destinations.ts`, `src/lib/outbound-destination.ts`, `src/lib/mcp/federation.ts` |
| Self-host | `docker-compose.yml`, `Dockerfile`, `public/docs/self-hosting.md`, `src/app/fonts/Geist-Variable.woff2`, `deploy/airgap/`, `.github/workflows/no-egress.yml`, `docs/self-host/backup-restore.md`, `scripts/self-host/backup.sh`, `.github/workflows/self-host-restore-drill.yml` |
| SDLC | `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/publish-cli.yml`, `.github/workflows/codeql.yml`, `.github/workflows/sbom.yml`, `.github/workflows/no-egress.yml`, `scripts/audit-production.mjs`, `SECURITY.md`, `docs/security/incident-runbook.md`, `docs/security/supply-chain.md` |
| Élő leltár | `scripts/list-self-host-stack.mjs` |

A self-host proxy módhoz a proxycsatorna hitelesítésére `MTLS_PROXY_SHARED_SECRET` is kell; a továbbított IP-fejlécek önmagukban nem elegendők. Lásd a frissített mTLS-útmutatót.
