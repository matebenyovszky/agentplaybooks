# Eszközleltár

**Ellenőrzés:** 2026-10-24, a forráskód alapján. Élő példány: futtasd a `scripts/list-self-host-stack.mjs` scriptet, és csatold a kimenetet ehhez a dokumentumhoz.

> **Jogi ellenőrzés szükséges.** Az „EIR eszköz” határa (csak az AgentPlaybooks instance, vagy a teljes AI-ügynök környezet) az ügyfél osztályba sorolásának része.

A leltár a **self-host** üzemre vonatkozik. A nyilvános SaaS (Cloudflare + hosted Supabase) más eszközhatár.

Angol: [asset-inventory.md](./asset-inventory.md). Fehérkönyv: [whitepaper.hu.md](./whitepaper.hu.md).

## 1. Alkalmazáskomponens (ebben a repóban)

| Komponens | Típus | Hol | Port / kötet | Megjegyzés |
|-----------|-------|-----|--------------|------------|
| `app` | Docker szolgáltatás | [`docker-compose.yml`](../../docker-compose.yml) | `${APP_PORT:-3000}:3000` | Egyetlen compose-szolgáltatás |
| Next.js 16 + React 19 | Runtime | [`package.json`](../../package.json), [`Dockerfile`](../../Dockerfile) | 3000/tcp a konténerben | `output: "standalone"` — [`next.config.ts`](../../next.config.ts) |
| Hono API | Ugyanaz a folyamat | `src/app/api/` | — | REST / MCP / OpenAPI |
| Nem-root user | Image | `Dockerfile` `nextjs` uid 1001 | — | `NEXT_TELEMETRY_DISABLED=1`, healthcheck `wget` `:3000` |
| Statikus doksik | Image réteg | `public/` | — | A worker build másképp csomagol (Cloudflare) |
| Helyszíni mentés / restore | Scriptek + runbook | [`scripts/self-host/`](../../scripts/self-host/), [`docs/self-host/backup-restore.md`](../self-host/backup-restore.md) | Titkosított archívum a `BACKUP_DIR`-ben | **Kész a `main`-en:** [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203). A mesterkulcs nincs az archívumban |

A script a deklarált compose-t mindig kiírja; Docker nélkül `--declared-only`.

```bash
npm run inventory:self-host
node scripts/list-self-host-stack.mjs --declared-only --json
node scripts/list-self-host-stack.mjs --compose-file /opt/supabase/docker/docker-compose.yml
```

Forrás: [`scripts/list-self-host-stack.mjs`](../../scripts/list-self-host-stack.mjs).

## 2. Supabase / Postgres szolgáltatások (ügyfél stack, nem ebben a compose-ban)

A self-host guide szerint a alkalmazás **teljes Supabase stacket** igényel, nem bare Postgres-t: [`public/docs/self-hosting.md`](../../public/docs/self-hosting.md), [`supabase/README.md`](../../supabase/README.md). Az alábbi nevek a hivatalos [Supabase Docker self-host](https://supabase.com/docs/guides/self-hosting/docker) tipikus szolgáltatásai; a **tényleges** portok a customer compose-ból és a script kimenetéből jönnek.

| Szolgáltatás | Tipikus port | Szerep ehhez a termékhez |
|--------------|--------------|--------------------------|
| Kong | 8000 HTTP, 8443 HTTPS | API gateway: Auth, REST, Storage, Realtime, Studio |
| db / postgres | 5432 | Adatok: ciphertext, `audit_logs`, RLS, kötet |
| supavisor / pooler | 5432 session, 6543 transaction | Kapcsolatpooling |
| auth / gotrue | 9999 (belső) | JWT, e-mail, Entra/OAuth |
| rest / postgrest | 3000 (belső) | Minden alkalmazásútvonal Data API-ja |
| studio | 3000 (belső, Kong mögött) | Admin UI — hálózati szigor ügyféli |
| meta | 8080 (belső) | Postgres meta |
| realtime, storage, imgproxy, analytics, vector, functions, inbucket | lásd script | Ehhez az apphoz nem kötelezőek |

**Kötetek (ügyfél):** Postgres adatkönyvtár, Auth-kulcsok, Kong TLS, GoTrue env. Ez a repó nem definiál `volumes:` blokkot a `docker-compose.yml`-ben.

Séma: [`supabase/schema.sql`](../../supabase/schema.sql) (új projekt), [`supabase/migrations/`](../../supabase/migrations/) (előrelépés).

## 3. Kulcsok és titkok

| Név | Hol | Minősítés | Forgás / visszavonás |
|-----|-----|-----------|----------------------|
| `SECRETS_ENCRYPTION_KEY` | App env, 64 hex | Vault mesterkulcs; KMS nincs; **soha nincs a mentési archívumban** | Forgás újratitkosítás nélkül = adatvesztés |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Üzemeltetői env a `backup.sh`-hoz | Archívum-titkosítás; nem lehet azonos a vault mesterkulccsal | A `SECRETS_ENCRYPTION_KEY`-től függetlenül forgatandó |
| `SUPABASE_SERVICE_ROLE_KEY` | App env | RLS megkerülés; soha a kliensnek | Ügyfél Auth/JWT secret rotációja |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build + runtime | Nyilvános anon kulcs; a böngésző eléri | Újraépítés kell a cseréhez (Next inlined `NEXT_PUBLIC_*`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Build + runtime | Böngészőből elérhető URL | Újraépítés |
| `NEXT_PUBLIC_APP_URL` | Build + runtime | Saját origin; üresen a hosted domainre esik | Újraépítés |
| `ALLOWED_ORIGINS` | Runtime, opcionális | CORS allow-list csere | Restart |
| `SECRETS_REQUIRE_ALLOWED_HOSTS` | Runtime, opcionális | `true` = kötelező `allowed_hosts` | Restart |
| `NO_EGRESS` | Runtime, opcionális | `true` kikapcsolja az opcionális kimenő hívásokat (MCP-registry keresés), hacsak a `MCP_REGISTRY_URL` belső tükör. **Kész a `main`-en:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) | Restart |
| `MCP_REGISTRY_URL` | Runtime, opcionális | Hivatalos MCP-registry keresés felülírása / tiltása | Restart |
| `MTLS_MODE` | Runtime, opcionális | `cloudflare` (alapértelmezés), `proxy` vagy `off`. Ismeretlen érték fail-closed. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | Restart |
| `MTLS_PROXY_FINGERPRINT_HEADER` | Runtime, `proxy` módban | A terminátor által, a kliens tanúsítvány ellenőrzése után beállított fejléc | Restart |
| `MTLS_TRUSTED_PROXIES` | Runtime, `proxy` módban | A TLS-terminátor IP-i/CIDR-jei | Restart |
| `GOTRUE_EXTERNAL_AZURE_*` | GoTrue env | Entra SSO | GoTrue restart |
| Playbook API-kulcsok | `api_keys.key_hash` | SHA-256; plaintext egyszer | `is_active` / `expires_at` |
| User API-kulcsok | `user_api_keys` | Ugyanaz | Ugyanaz |
| Vault titkok | `secrets` ciphertext | AES-256-GCM | `expires_at`, rotate API, owner reveal |
| mTLS ujjlenyomatok | `secret_clients` | Nincs privát kulcs a szerveren | `is_active=false` |

Nincs `.env.example` a gyökérben; a kanonikus lista a compose és a self-hosting táblázat.

## 4. Hálózati felületek

| Felület | Alapértelmezés | Ki publikálja |
|---------|----------------|---------------|
| Alkalmazás HTTP | 3000 | `docker-compose.yml` |
| Alkalmazás HTTPS | nincs a compose-ban | Ügyfél reverse proxy / TLS |
| mTLS | A Node nem terminál TLS-t; `MTLS_MODE=proxy` terminátor mögött | Cloudflare (hosted) vagy trusted proxy. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) — [`public/docs/self-hosted-mtls.md`](../../public/docs/self-hosted-mtls.md) |
| Supabase Kong | 8000 / 8443 | Ügyfél Supabase compose |
| Postgres | 5432 — **ne legyen internetre nyitva** | Ügyfél |

## 5. Külső függőségek

### Build / CI (nem runtime a self-host appban)

| Függőség | Miért | Egress? |
|----------|-------|---------|
| npm registry | `npm ci` | Igen, buildkor |
| `next/font/local` Geist / Geist Mono woff2 | [`src/app/layout.tsx`](../../src/app/layout.tsx), [`src/app/fonts/Geist-Variable.woff2`](../../src/app/fonts/Geist-Variable.woff2) | Buildkor nincs Google Fonts letöltés. **Kész a `main`-en:** [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200) |
| GitHub Actions | CI, Dependabot, CLI publish | SaaS CI, nem az on-prem instance |
| npm trusted publishing | `@agentplaybooks/cli` provenance | Kiadáskor, nem az instance |

### Runtime, self-host

| Függőség | Kötelező? | Megjegyzés |
|----------|-----------|------------|
| Self-hosted Supabase | Igen | Data API + Auth |
| Entra / Google / GitHub / LinkedIn | Nem | Csak ha az ügyfél bekapcsolja az OAuth-ot |
| Ügynök által választott HTTPS célok | A vault proxy használatakor | `allowed_hosts` + SSRF |
| Cloudflare | Nem self-hoston | Hosted útvonal; self-host mTLS helyi terminátort használ |

Produkciós npm audit: [`scripts/audit-production.mjs`](../../scripts/audit-production.mjs). Lockfile: [`package-lock.json`](../../package-lock.json), [`packages/cli/package-lock.json`](../../packages/cli/package-lock.json).

CycloneDX SBOM és SBOM-blob cosign `cli-v*` tageken a `main`-en van. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205) — [`docs/security/supply-chain.md`](./supply-chain.md), [`.github/workflows/sbom.yml`](../../.github/workflows/sbom.yml). A lockfile továbbra is a reprodukálható telepítés bemenete. Aláírt konténer-registry publikálás továbbra sincs. A secrets-flow izolált no-egress CI a `main`-en van (**Kész a `main`-en:** [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) — [`.github/workflows/no-egress.yml`](../../.github/workflows/no-egress.yml), [`deploy/airgap/`](../../deploy/airgap/)). Az `npm ci` és az alapimage-húzás a job izolálása előtt történik.

## 6. Adattárolók (logikai eszközök)

Főbb táblák: `playbooks`, `secrets`, `audit_logs`, `api_keys`, `user_api_keys`, `secret_clients`, `playbook_collaborators`, `playbook_snapshots`, `skills`, `memories`, `canvas`, `mcp_servers`, `profiles` — lásd [`README.md`](../../README.md) séma-szakasz és [`supabase/schema.sql`](../../supabase/schema.sql).

## 7. A leltár naprakészen tartása

1. Deploy vagy compose-változás után: `npm run inventory:self-host` (és a Supabase `--compose-file`).
2. A markdown/JSON kimenetet csatold az ügyfél EIR-dossziéjához.
3. A `docs:check` a relatív linkeket és a citált forrásutakat ellenőrzi, a futó konténereket nem.

A CM (Configuration Management) család ügyféli fele: a kimenet verziózása, eltérésvizsgálat a fenti statikus táblához képest — lásd [risk-assessment.hu.md](./risk-assessment.hu.md).

`MTLS_PROXY_SHARED_SECRET`: private proxy channel token, required in proxy mode; same random value in app and terminator. Rotate both together. Forwarded IP headers alone are not trusted.
