# Auditnapló (export, megőrzés, hamisításjelzés)

Az `audit_logs` tábla a playbook auditnyoma: a federált MCP-hívások és a
trezor-műveletek (`secret.*`) egy helyen, olvasható a
`GET /api/playbooks/:guid/audit` végponton. Egy sor soha nem tartalmaz titkos
értéket, teljes kimenő URL-t vagy API-kulcsot.

Ez az oldal a EU-s és saját hosztolású telepítések megfelelőségi vezérlőit
írja le: export, opcionális SIEM-továbbítás, megőrzés, playbookonkénti
hash-lánc, és a csak olvasható **auditor** szerep.

## Ki olvashatja a nyomot

| Hívó | Audit olvasás / export / ellenőzés | Titkos értékek | Írás |
| --- | --- | --- | --- |
| Tulajdonos (munkamenet vagy user API-kulcs `playbooks:read` vagy `audit:read` jogosultsággal) | Igen | Igen (a trezor meglévő szabályai szerint) | Igen |
| Auditor közreműködő | Igen | Nem | Nem |
| Playbook API-kulcs `auditor` szereppel | Igen | Nem | Nem |
| Szerkesztő, viewer/coworker/admin playbook kulcsok | Nem | A meglévő szabályok szerint | A meglévő szabályok szerint |

A trezorműveleteket végző playbook API-kulcs továbbra sem olvashatja azok
nyomát. Hívjon meg auditort a **Megosztás** lapról, vagy hozzon létre
Auditor szerepű playbook kulcsot (csak `audit:read` + `playbooks:read`).

## Export

```http
GET /api/playbooks/:guid/audit?format=jsonl&since=2026-01-01T00:00:00.000Z&until=2026-12-31T23:59:59.000Z&actor=apb_live_abcd&action=secret.
GET /api/playbooks/:guid/audit/export?format=csv
Authorization: Bearer <jwt_vagy_user_api_kulcs_vagy_auditor_playbook_kulcs>
```

A `format` értéke `json` (az `/audit` alapértelmezése), `jsonl` (az `/export`
alapértelmezése) vagy `csv`. Szűrők: `action` (`operation` alias), `actor`
(`actor_id`), `actor_type`, `since`, `until`, `secret`, `limit`.

CLI (user API-kulcs az `apb login`-ból vagy `AGENTPLAYBOOKS_API_KEY`):

```bash
apb audit export <guid> --format=jsonl --since=2026-01-01T00:00:00Z --action=secret.
apb audit export --format=csv > trail.csv   # minden playbook, amit a kulcs auditálhat
apb audit verify <guid>
```

## Hash-lánc

Minden sor tárol `prev_hash` és `hash = sha256(a sor kanonikus JSON-ja, a
prev_hash-sal együtt)` értéket. Egy playbook első sora 64 nulla hexjegytől
indul. A `GET /api/playbooks/:guid/audit/verify` és az `apb audit verify`
sorrendben újraszámolja a láncot, és az első törött láncszemet jelenti
(`prev_hash` vagy `hash`).

Éles adatbázison a `20261024120000_audit_logs_compliance.sql` migráció
kell a oszlopokhoz és a meglévő sorok feltöltéséhez. Jóváhagyás és mentés
nélkül ne futtassa. Az üzemeltetői lépések (preflight, `pg_dump`, adatbázison
belüli másolat, hash-lánc ellenőrzés, rollback):
[`scripts/ops/audit-migration/RUNBOOK.md`](https://github.com/matebenyovszky/agentplaybooks/blob/cursor/audit-logs-compliance-adfd/scripts/ops/audit-migration/RUNBOOK.md).
A migrációt a app-változás merge-e **előtt** kell futtatni; a korábban
telepített app az additive sémát elviseli.

## Megőrzés

Ha az `AUDIT_RETENTION_DAYS` nincs beállítva (vagy `0` / `forever`), a jelenlegi
viselkedés marad: a naplók a playbook vagy a fiók törléséig megmaradnak.

Pozitív egész esetén az ütemezett törlés a vágásnál régebbi sorokat törli,
`audit_chain_checkpoints` sort ír az utolsó törölt hash-sel, hogy a megmaradó
lánc ellenőrizhető maradjon, majd `audit.retention_purge` bejegyzést fűz a
lánchoz.

```bash
curl -X POST -H "Authorization: Bearer $AUDIT_CRON_SECRET" \
  https://sajat-peldany/api/cron/audit-purge
```

A tulajdonos egy playbookot explicit is törölhet:

```bash
apb audit purge <guid> --days=365 --yes
```

## Opcionális továbbítás (alapból ki)

Sikeres beszúrás után az API a hívót nem blokkolva továbbíthat. A hibák
backoffkal újrapróbálkoznak, és naplózódnak; egy elérhetetlen SIEM nem
viszi magával a trezort vagy a federált hívást.

| Változó | Alapértelmezés | Cél |
| --- | --- | --- |
| `AUDIT_SYSLOG_URL` | nincs (ki) | `udp://host:514`, `tcp://host:514` vagy `tls://host:6514` (RFC 5424) |
| `AUDIT_SYSLOG_HOSTNAME` | `agentplaybooks` | RFC 5424 HOSTNAME |
| `AUDIT_SIEM_WEBHOOK_URL` | nincs (ki) | a export JSON objektum HTTPS POST-ja |
| `AUDIT_SIEM_WEBHOOK_SECRET` | nincs | a törzs HMAC-SHA256 kulcsa. Nagy entrópiájú véletlen, **legalább 32 bájt** (`openssl rand -base64 32`), nem emberi jelszó. A webhook URL beállításakor kötelező; rövidebb érték fail-closed. |
| `AUDIT_SIEM_HMAC_HEADER` | `X-Audit-Signature` | `sha256=<hex>` fejléc |
| `AUDIT_RETENTION_DAYS` | nincs (örökre) | pozitív egész az ütemezett törléshez |
| `AUDIT_CRON_SECRET` | nincs (a végpont rejtett) | Bearer token a `POST /api/cron/audit-purge`-hoz (`CRON_SECRET` is elfogadott) |

A syslog Node socketeket használ (saját hosztolású Node). A HTTPS webhook
Cloudflare Workereken is működik. A továbbítás best-effort; garantált
másolathoz húzza az exportot.
