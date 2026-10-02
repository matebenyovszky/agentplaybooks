# Hermes szervezeteknek

Minden munkatárs a saját Hermes ügynökét futtatja, a közös részeket pedig egy
helyről kezeled. Egy **bundle playbook** hordozza a szervezet alapbeállításait:
LLM-providereket, MCP-szervereket, skilleket, a telepítendő botokat és az
olvasható közös tudást. Az `apb hermes sync` ezt alkalmazza egy gépre. Minden
bot külön playbook.

Ez az útmutató a kiosztás menetét írja le. A memóriáról lásd:
[Hermes memória-provider](./hermes-memory.md).

## Az elemek

| Playbook | Láthatóság | Tartalom |
|---|---|---|
| Bundle (szervezetenként egy) | unlisted, intranetes példányon | `config.hermes`, szervezeti skillek |
| Botonként egy | unlisted | persona, utasítások, skillek, MCP-szerverek |
| Közös tudás | unlisted | kurált memóriák: csak elvek és módszerek |
| Munkatársanként egy | **private** | az adott ember memóriája |

A bundle- és bot-playbookokat a szinkron az ügynöki végpontról olvassa
(`GET /api/playbooks/<guid>?format=json`). Ez a végpont nyilvános és unlisted
playbookot kulcs nélkül is kiad. Ha a példányt csak az intranetről lehet elérni,
egyetlen munkatársnak sem kell hitelesítő adat az alapbeállításokhoz. Titkot ne
tegyél a bundle-be: a `config` mezőjét mindenki olvashatja, aki eléri a példányt.

## `config.hermes`

A bundle playbook `config` mezőjében kell megadni. Minden kulcsa opcionális.

```json
{
  "hermes": {
    "managed": {
      "providers": {
        "local": { "name": "Helyi Ollama", "base_url": "http://llm.intranet:11434/v1",
                   "api_key": "no-auth", "models": ["qwen3.8:27b"], "discover_models": false }
      },
      "mcp_servers": { "sql": { "url": "http://sql-mcp.intranet:8006/mcp", "timeout": 120 } }
    },
    "defaults": { "model": { "default": "qwen3.8:27b", "provider": "local" } },
    "env": { "MSGRAPH_CLIENT_ID": "00000000-0000-0000-0000-000000000000" },
    "bots": ["<bot-playbook-guid>"],
    "shared_memory": ["<kozos-tudas-guid>"]
  }
}
```

| Kulcs | Ebből lesz |
|---|---|
| `managed` | A Hermes **managed scope**-ja (`config.yaml` a managed könyvtárban). Rögzített: sem a Hermes, sem a desktop app nem módosíthatja. |
| `defaults` | Minden profil saját `config.yaml`-jébe kerül, de csak ott, ahol a kulcs még nincs beállítva. Az alapértelmezett modellt a felhasználó átállíthatja. |
| `env` | A managed `.env`, amelyet a Hermes utolsóként tölt be. Egysoros, nem titkos értékek. |
| `bots` | Bot-playbookok. Mindegyikből egy Hermes-profil lesz. |
| `shared_memory` | Csak olvasható közös források a memória-providernek. |
| `plugins` | Hermes-pluginok, amelyek minden szinkronizált profilba bekerülnek, ahol még nincsenek: katalógusnév (`"agentplaybooks-tools"`) vagy `{ "name", "source", "ref" }` 40 karakteres committal. Az `agentplaybooks-memory`-t a `--memory` telepíti. |

Egy bot-playbook beállíthatja a `config.hermes.profile_name` értéket. Ha nem
teszi, a profil neve a playbook nevéből készül, kisbetűsítve és ékezetek nélkül.
A `config.hermes.version` is megadható.

## Egy gép szinkronizálása

```bash
apb hermes sync <bundle-guid> --url=https://agents.example.org \
  --managed-dir="%LOCALAPPDATA%\example\hermes-managed" \
  --memory=<szemelyes-memoria-guid> --apply
```

`--apply` nélkül a parancs csak a tervét mutatja meg. Vele a következők történnek:

1. A managed könyvtárba írja a `config.yaml`-t és a `.env`-et. A bundle
   skilljei a `skills/` alá kerülnek, amely `skills.external_dirs`-ként rögzített.
2. Minden botot profil-disztribúcióként ír a `bots/<név>/` alá. A Hermes
   `hermes profile install`-lal telepíti, vagy ha már létezik, `hermes profile update`-tel
   frissíti. Egy azonos nevű, de nem disztribúcióból telepített profilhoz nem nyúl.
3. A `defaults` értékeit, és a bot saját MCP-szervereit, beírja minden profil
   `config.yaml`-jébe, ahol a kulcs még nincs beállítva.
4. `--memory` esetén mindegyik profilban beállítja a memória-providert: a személyes
   playbookot és a `shared_memory` forrásait. A személyes kulcsot egyszer olvassa
   be az `AGENTPLAYBOOKS_MEMORY_API_KEY` változóból, és a managed `.env`-ben őrzi meg.
5. Rögzíti a `state.json`-t: bundle, időpont, skillek, botok és az esetleges hibák.

Hitelesítő adat soha nem a bundle-ből jön. Ezeket az `--env-file=<fájl>`
kapcsolóval add meg: egy `KULCS=ÉRTÉK` fájlban, amelyet csak az arra jogosultak
olvashatnak, például egy védett megosztáson. Az értékek a managed `.env`-be
kerülnek, és a későbbi szinkronoknál is megmaradnak, akkor is, ha a fájl éppen
nem érhető el. Ha egy kulcsot a bundle `env` mezője korábban beállított, de már
nem állít, az törlődik.

A Hermes csak akkor olvassa a managed réteget, ha a `HERMES_MANAGED_DIR` a
managed könyvtárra mutat. A telepítő ezt egyszer állítsa be felhasználói
környezeti változóként. TLS nélküli intranetes példánynál add hozzá az
`--allow-insecure-http` kapcsolót; lásd: [Önhosztolás](./self-hosting.md).

Ugyanezt a parancsot érdemes ütemezett feladatból futtatni, például
bejelentkezéskor és naponta. Így minden gép az aktuális bundle-t használja.
A bot frissítése nem érinti a bot munkameneteit és memóriáját.

## Tanulás ügyadatok kiszivárgása nélkül

A Hermes helyben tovább tanul. A saját `MEMORY.md`-je és a munkatárs privát
playbookja tartalmazhat ügyspecifikus részleteket. A közös tudás ettől külön marad:

- Minden profil olvassa a közös tudás playbookját, de írni nem tudja.
- Tanulság csak áttekintés után kerülhet bele. Valaki javasol egy általánosított
  elvet vagy módszert, név, ügyszám és dokumentumtartalom nélkül. Egy kurátor
  ellenőrzi és előlépteti.
- Semmi nem lép elő automatikusan.

## A jelenlegi változat korlátai

- A felhasználói szintű managed könyvtár csak tanácsadó jellegű, mert a munkatárs
  szerkesztheti. Valódi kikényszerítéshez gépszintű, a felhasználók számára csak
  olvasható `HERMES_MANAGED_DIR` kell, amelyet az eszközfelügyelet állít be.
- A bundle- és bot-playbookoknak nyilvánosnak vagy unlistednek kell lenniük.
  A csak szervezeten belüli láthatóság tervben van.
- A privát memória-playbookot és a kulcsát minden munkatárs egyszer, a
  webes felületen hozza létre.
