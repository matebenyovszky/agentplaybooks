# Helyszíni mentés és visszaállítás

Mentés, üzletmenet-folytonosság és katasztrófa utáni helyreállítás önállóan hosztolt AgentPlaybooks példányhoz. Ez a runbook a **NIS2 21. cikk (2) bekezdés (c) pontját** (mentéskezelés és katasztrófa utáni helyreállítás) támogatja azoknak az üzemeltetőknek, akik a terméket saját infrastruktúrán futtatják.

Üzemeltetési útmutató, **nem jogi tanács**. A megőrzést, besorolást és a bejelentési kötelezettségeket éles használat előtt az IBF-fel (információbiztonságért felelős személy) és jogásszal kell egyeztetni.

A tesztterv szerinti restore drill — mentésből visszaállítás üres gépre, titkok olvashatóságának ellenőrzése, audit-nyomvonal, RTO rögzítése — automatizált: `scripts/self-host/restore-drill.sh` és `.github/workflows/self-host-restore-drill.yml`.

Kapcsolódó: [Önhosztolás](./self-hosting.md), [Platformközi ügynökmentések](./portable-agent-backups.md) (`apb push` / `apb pull` a playbook fájljairól — **nem** titokszéf- vagy adatbázis-mentés). Ugyanez a runbook a repóban: `docs/self-host/backup-restore.hu.md`.

## Mit kell menteni

Az önhosztolt példány állapot nélküli alkalmazás-konténerből áll (a gyökér `docker-compose.yml`) és állapotot tároló adatrétegből (önhosztolt Supabase, vagy a `scripts/self-host/compose.yml` Postgres + objektumtár, amelyet ez a runbook használ).

| Komponens | Miért | Hogyan menti a repó |
| --- | --- | --- |
| **Postgres / Supabase adatbázis** | Playbookok, titokszéf-titkosított értékek (`public.secrets`), `public.audit_logs`, auth-felhasználók, memória, pillanatképek | `pg_dump` egyedi formátum, a teljes adatbázis (minden nem-katalógus séma) |
| **Titokszéf-táblák** | AES-256-GCM titkosított szöveg, IV, hitelesítő címke. A mesterkulcs nélkül használhatatlan | Az adatbázis-mentésben benne van |
| **Objektumtár** | Supabase Storage bucketek / feltöltött fájlok | A storage-kötet tar archívuma |
| **Konfiguráció** | Compose fájlok, `supabase/config.toml` | Belemásolódik az archívumba |
| **Környezet / titkok** | Kapcsolati URL-ek, JWT, service-role kulcs | Csak **kitakart** másolat (`<redacted>`) |
| **Titkosítási mesterkulcs** (`SECRETS_ENCRYPTION_KEY`) | HKDF bemenet minden titokhoz | **Soha nincs az archívumban.** Külön tárolandó (HSM, lezárt boríték, jelszókezelő), saját offsite másolattal |

Az alkalmazáskép ebből a repóból épül újra. A kontéerrétegek nem a hivatalos mentés.

Az `apb push` hordozható pillanatképei skilleket és MCP-**hivatkozásokat** tárolnak, nem a széf értékeit. Nem helyettesítik ezt a runbookot.

## Figyelmeztetés kulcsvesztésre

**Ha a `SECRETS_ENCRYPTION_KEY` elvész, minden tárolt titok elveszett.**

A széf felhasználónkénti AES-256-GCM kulcsot vezet le HKDF-fel ebből a 64 hexadecimális karakteres mesterkulcsból, a tulajdonos azonosítójából, és (v2 titkosított szövegnél) a playbook azonosítójából és a titok nevéből. Az adatbázis csak titkosított szöveget tart. A termékben nincs újratitkosítás és nincs kulcs-escrow.

- A kulcsot egyszer kell generálni: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Az archívumon **kívül** tárolandó, a `BACKUP_ENCRYPTION_PASSPHRASE`-tól eltérő hozzáférés-vezérléssel
- Forgatása újratitkosítási eljárás nélkül olvashatatlanná teszi a meglévő sorokat
- A sikeres adatbázis-visszaállítás rossz kulccsal is egészségesnek tűnhet: a playbookok és az audit sorok megvannak, a `secret.encrypted_value` is — a visszafejtés csak akkor bukik el, amikor valaki olvassa a titkot

A hiányzó mesterkulcsot a szervezet folyamata szerint bejelentendő eseményként kell kezelni, nem újabb restore-próbaként.

## Ütemezés

| Esemény | Ajánlás |
| --- | --- |
| Állandósult üzem | Legalább napi teljes mentés; óránkénti, ha a biztonsági osztály vagy az RPO ezt kéri |
| Sémamigráció után | Extra teljes mentés a `supabase/migrations/` alkalmazása előtt és után |
| Kulcs-ceremónia után | Csak config és adatbázis — az új mesterkulcs maradjon külön |
| Restore drill után | A drill archívuma a következő sikeres drillig megőrzendő |

Cron példa (a compose projektet látó gépen):

```bash
# /etc/cron.d/agentplaybooks-backup
SHELL=/bin/bash
15 2 * * *  root  set -a; . /etc/agentplaybooks/backup.env; set +a; /opt/agentplaybooks/scripts/self-host/backup.sh >>/var/log/apb-backup.log 2>&1
```

A `scripts/self-host/backup.env.example` tartalmát `/etc/agentplaybooks/backup.env` fájlba kell tölteni (mód `0600`).

## A mentések titkosítása

Az archívumok nyugalmi állapotban **AES-256-CBC, PBKDF2, 310 000 iteráció** mellett, OpenSSL-lel, a `BACKUP_ENCRYPTION_PASSPHRASE` használatával titkosítottak.

- Ez a jelszó **nem** lehet a `SECRETS_ENCRYPTION_KEY`
- A fájlok módja `0600`, a `BACKUP_DIR` (alapértelmezés `./backups`) módja `0700`
- A `--no-encrypt` csak elszigetelt laborhibakeresésre való; élesben tilos
- Opcionális offsite másolat: `BACKUP_OFFSITE_RSYNC`

A széf titkosított szövege az archívumban *újra* titkosított. Ez mélységi védelem, nem a mesterkulcs helyettesítője.

## Megőrzés

A `backup.sh` törli a `BACKUP_RETENTION_DAYS` (alap 90) napnál régebbi archívumokat, majd csak a legújabb `BACKUP_KEEP_COUNT` (alap 14) darabot tartja meg.

A számokat a 7/2024. (VI. 24.) MK rendelet szerinti besoroláshoz / a szervezeti szabályzathoz kell igazítani. Kiindulópont:

- 14 napi másolat helyben
- 4 heti másolat offsite
- 6 havi másolat offsite

A szkript egyszerű nap/darabszám-korlátot valósít meg; a teljes GFS-naptár a mentési termékben (Veeam, Borg, restic) élhet ezekre az archívumokra ráépítve. A megőrzést lemezhasználat miatt ne gyengítsük.

## Offsite másolat

A `BACKUP_OFFSITE_RSYNC` egy második gépre vagy fürtre mutasson (példa: `backup@dr.example.org:/var/backups/agentplaybooks/`). A `backup.sh` sikeres titkosítás után `rsync -a`-t futtat.

3-2-1 minta: három másolat, két hordozó, egy offsite. A primer gép compose-kötetei **nem** offsite másolatok.

## RPO / RTO iránymutatás

Kiinduló célok helyszíni példányhoz. Szűkítendők, ha a biztonsági osztály, az IBF vagy a szerződés ezt kéri.

| Mutató | Jelentés | Amit a repó ad |
| --- | --- | --- |
| **RPO** (megengedett adatvesztés) | Maximális elfogadható adatvesztés | A mentési időközzel egyenlő. Napi mentés ⇒ RPO ≤ 24 óra. Óránkénti ⇒ RPO ≤ 1 óra |
| **RTO** (helyreállítási idő) | Maximális elfogadható kiesés | Az üres gépen mért `restore.sh` falidő, `RTO_SECONDS`-ként kiírva |

Minden restore drill `RTO_SECONDS` értékét rögzíteni kell (CI-napló és BCP-mappa). Ha a mért RTO a célt túllépi, az üzemeltetési (gyorsabb lemez, meleg tartalék, kisebb adatbázis) — nem az audit vagy a tesztek gyengítése.

Első cél jelentős osztályú helyszíni példányhoz: **RPO ≤ 24 óra, RTO ≤ 4 óra**. Magas osztálynál szorosabb pár és dokumentált meleg tartalék kell.

## Visszaállítási eljárás (üres gép)

1. Docker telepítése és a repó klónozása (vagy a compose fájlok és szkriptek másolása).
2. A **`SECRETS_ENCRYPTION_KEY`** visszaállítása a külön titkos tárból az alkalmazás környezetébe. Ezt a lépést nem szabad kihagyni.
3. A **`BACKUP_ENCRYPTION_PASSPHRASE`** visszaállítása az archívum visszafejtéséhez.
4. A legújabb `.tar.gz.enc` másolása az offsite tárból a gépre.
5. Üres adatréteg indítása:

   ```bash
   docker compose -f scripts/self-host/compose.yml down -v
   docker compose -f scripts/self-host/compose.yml up -d
   ```

   Hivatalos önhosztolt Supabase esetén azt a stacket **új kötetekkel** kell indítani, és a `COMPOSE_FILE` / `DB_SERVICE` / `STORAGE_SERVICE` változókat arra kell állítani.

6. Visszaállítás:

   ```bash
   export BACKUP_ENCRYPTION_PASSPHRASE=…
   export SECRETS_ENCRYPTION_KEY=…
   ./scripts/self-host/restore.sh --archive backups/agentplaybooks-backup-YYYYMMDDTHHMMSSZ.tar.gz.enc
   ```

7. Az alkalmazás indítása (vagy újraépítése) a gyökér `docker-compose.yml` alapján, ugyanazokkal a böngészőből elérhető `NEXT_PUBLIC_SUPABASE_*` értékekkel, és beállított `SECRETS_ENCRYPTION_KEY` mellett.
8. Ellenőrzés:
   - Az incidens előtt létezett playbook betöltődik
   - Egy titok visszafejthető (reveal vagy `use_secret` ismert tesztértékkel)
   - Az `audit_logs` sorszáma legalább az incidens előtti
   - Ha ezen a revízión létezik az audit hash-lánc ellenőrző parancs, azt is futtatni kell
9. A kiírt `RTO_SECONDS` bejegyzése a drill jegyzőkönyvébe.

A `restore.sh` **eldobja és újra létrehozza** a céladatbázist. Élő, még szükséges példányra nem szabad ráengedni.

## Szkriptek

| Szkript | Cél |
| --- | --- |
| `scripts/self-host/backup.sh` | Postgres + tár + kitakart config dump; titkosítás; megőrzés; opcionális offsite rsync |
| `scripts/self-host/restore.sh` | Visszafejtés, adatbázis újraépítése, dump és tár visszaállítása; RTO kiírása |
| `scripts/self-host/restore-drill.sh` | Üresgépes drill, CI-ban is |
| `scripts/self-host/compose.yml` | Postgres 17 + storage-kötet, ha nem a teljes Supabase Docker-stack fut |
| `scripts/self-host/backup.env.example` | Környezeti sablon (kitöltött példányt tilos commitolni) |

```bash
# Mentés (a repó gyökeréből)
set -a; . /etc/agentplaybooks/backup.env; set +a
./scripts/self-host/backup.sh

# Visszaállítás üres kötetekre
./scripts/self-host/restore.sh --archive backups/agentplaybooks-backup-….tar.gz.enc

# Automatizált drill (a CI is ezt futtatja)
./scripts/self-host/restore-drill.sh
```

Ugyanezek a szkriptek hivatalos Supabase compose-projektre:

```bash
export COMPOSE_FILE=/opt/supabase/docker/docker-compose.yml
export COMPOSE_PROJECT_NAME=supabase
export DB_SERVICE=db
export STORAGE_SERVICE=storage
export STORAGE_PATH=/var/lib/storage
```

## Restore drill

A drill:

1. Elindítja a `scripts/self-host/compose.yml` stacket
2. Alkalmazza a `supabase/schema.sql` sémát
3. Beszúr egy playbookot, egy AES-256-GCM titkot, három `audit_logs` sort és egy tárolt objektumot
4. Futtatja a `backup.sh`-t
5. `docker compose down -v` (a köteteknek el kell tűnniük)
6. Üres stacket indít, és futtatja a `restore.sh`-t
7. Ellenőrzi: a titok ugyanarra a nyílt szövegre fejthető vissza, a playbook neve/GUID-ja stimmel, az `audit_logs` száma változatlan, a tárolt objektum egyezik
8. Ha van audit hash-lánc ellenőrző (`npm run audit:chain`, `scripts/verify-audit-chain.sh` vagy `scripts/verify-audit-hash-chain.ts`), azt is futtatja; különben notice-t ír és folytatja
9. Kiírja az `RTO_SECONDS` értéket

CI: `.github/workflows/self-host-restore-drill.yml` (pull request és `main` ezeknek a fájloknak a változásakor, plusz heti ütemezés).
