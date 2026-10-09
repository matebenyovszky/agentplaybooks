# AgentPlaybooks a Claude-ban

A playbookjaid minden Claude-felületen működnek — claude.ai a weben, Claude
Desktop, Cowork, Claude Code és a mobilappok —, egyetlen MCP-végponton át, amely
az AgentPlaybooks-fiókoddal léptet be. A Claude-hoz nem kell API-kulcsot
létrehozni, másolni vagy cserélni.

Háromféleképpen lehet bekötni. Aszerint válassz, mit akarsz elérni a Claude-dal:

| Út | Mit ér el | Hol működik | Beállítás |
|---|---|---|---|
| [**Az AgentPlaybooks plugin**](#a-plugin) | A fiókod minden playbookját, plusz egy skillt, amely megtanítja a Claude-nak a használatukat | Chat, Cowork, Claude Code | Egyszer telepíted, belépsz |
| [**Egyéni connector**](#egy-ni-connector) | Egy playbookot vagy a teljes fiókot | Web, Desktop, Cowork, mobil | Beillesztesz egy URL-t, belépsz |
| [**Csak Claude Code**](#claude-code) | Egy playbookot vagy a fiókot, plusz helyi `doctor` és `sync` | Claude Code | Egy parancs |

## A plugin

A plugin három dolgot csomagol egybe:

- az **AgentPlaybooks connectort** a fiók-végponthoz
  (`https://agentplaybooks.ai/api/mcp/manage`). Rajta keresztül minden playbook
  elérhető, ami a tiéd vagy megosztották veled — a telepítés után megosztottak
  is —, és minden eszközhívás megnevezi, melyik playbookra vonatkozik;
- egy **playbooks skillt**, hogy a Claude tudja: előbb keresse meg a megfelelő
  playbookot, kérésre vegye fel a personáját és utasításait, a tartós tényeket a
  memóriájába írja ahelyett, hogy ismételgetné őket, és kérdezzen, mielőtt közös
  dolgot módosít;
- az **`/agentplaybooks:doctor` és `/agentplaybooks:sync` parancsokat** Claude
  Code-hoz, amelyek egy projekt agent-konfigurációs fájljait auditálják és
  szinkronizálják.

**claude.ai-ról vagy az asztali appból.**

1. Nyisd meg: [Customize → Plugins](https://claude.ai/customize/plugins).
2. Ha a plugin már szerepel az Anthropic directoryjában, keresd meg az
   **AgentPlaybooks**-ot a **Discover** alatt, és válaszd az **Add**-ot. Addig —
   vagy directory nélküli előfizetésen — válaszd az **Add → Add marketplace**
   menüt, írd be: `matebenyovszky/agentplaybooks`, és add hozzá onnan az
   **AgentPlaybooks**-ot.
3. Nyisd meg a plugin **Connectors** fülét. A plugin hozzáadása önmagában semmibe
   nem léptet be: ha a connector *Not added* állapotú, válaszd az **Add**-ot, majd
   a **Connect**-et, és lépj be az AgentPlaybooks-ba.

A fiókodhoz hozzáadott plugin elérhető chatben, Cowork-ben és — a következő
munkamenet indulásakor — Claude Code-ban. Team és Enterprise előfizetésen az
Owner dönti el, milyen plugin-forrásokat látnak a tagok, és ő adja hozzá a
connectort a szervezethez, ha a tagok nem tehetik meg.

**Parancssorból, Claude Code-ban.**

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Utána futtasd a `/mcp` parancsot, válaszd az **agentplaybooks-account**-ot, és
lépj be.

A plugin szándékosan nem tartalmaz futtatható fájlt — a claude.ai és a Cowork
elutasítja az olyan plugint, amelyben `bin/` mappa van —, ezért a parancsai a
kiadott CLI-t `npx`-szel futtatják, arra a verzióra rögzítve, amellyel a plugin
megjelent. A CLI többi parancsához (`connect`, `pull`, `push`, `backups`) telepítsd
npm-ről: lásd [CLI](/docs/cli).

## Egyéni connector

Ezzel egy konkrét playbookot adhatsz a Claude-nak — így a personája és az
utasításai a szerver saját promptjaként érkeznek —, vagy akkor, ha nem kéred a
plugint.

1. Nyisd meg: [Customize → Connectors](https://claude.ai/customize/connectors), és
   válaszd az **Add custom connector**-t. Team vagy Enterprise előfizetésen az
   Owner adja hozzá az [Organization settings → Connectors](https://claude.ai/admin-settings/connectors)
   alatt (**Add → Custom → Web**), a tagok pedig utána a saját fiókjukkal
   csatlakoznak. Az ingyenes csomag egy egyéni connectort enged.
2. Illeszd be az URL-t:
   - egy playbook: `https://agentplaybooks.ai/api/mcp/<guid>` — a playbook
     **Integrations** fülén találod;
   - a teljes fiók: `https://agentplaybooks.ai/api/mcp/manage`.
3. Az OAuth client ID és secret maradjon üresen. Ha a párbeszédpanel rákérdez a
   hitelesítésre, válaszd a **Sign in now**-t (a párbeszédpanel egyes
   változataiban **Always required**); ha arra, hogyan azonosítja magát a
   Claude, válaszd a **Register automatically**-t.
4. Válaszd az **Add**-ot, majd a **Connect**-et, és lépj be az AgentPlaybooks-ba.

A claude.ai-on hozzáadott connector Claude Desktopban, Cowork-ben és a
mobilappokban is elérhető. Egy beszélgetésben a **+ → Connectors** menüben
kapcsolhatod be.

### Mit enged a belépés

A connector a nevedben jár el. Azt olvashatja és módosíthatja, amit a fiókod —
minden playbookban, amit elér, és nem többet. Minden eszköz megmondja magáról,
hogy csak olvas-e: az olvasó eszközök — listázás, keresés, lekérés — kérdezés
nélkül futnak, egy olyan playbookot módosító eszköz előtt pedig, amelyet mások is
használhatnak, a Claude megkérdez, hacsak nem választod az adott eszköznél az
**Always allow**-t. A törlés és a csatolt szolgáltatások hívása rombolóként
(destructive) van megjelölve.

Titokérték soha nem jut el a Claude-hoz. A `list_secrets` csak neveket ad vissza,
a `use_secret` pedig úgy küldi el a kérést, hogy az értéket az AgentPlaybooks
szerver illeszti be.

## Claude Code

Egy playbookot vagy a fiókot egyetlen paranccsal adhatsz hozzá, utána a `/mcp`
alatt lépsz be:

```bash
claude mcp add --transport http apb-my-playbook https://agentplaybooks.ai/api/mcp/<guid>
```

```bash
claude mcp add --transport http agentplaybooks-account https://agentplaybooks.ai/api/mcp/manage
```

Ha a konfigurációt a repóban az egész csapat megosztja, használd inkább az
`apb connect <guid> --apply` vagy `apb connect --account --apply` parancsot — lásd
[CLI](/docs/cli). Ezek olyan `.mcp.json` bejegyzést írnak, amely környezeti
változóból olvas API-kulcsot, azoknak a klienseknek és CI-feladatoknak, amelyek
nem tudnak böngészős belépést futtatni.

## A Claude Desktop konfigurációs fájlja erre nem jó

A `claude_desktop_config.json` csak **helyi** szervereket ír le: egy `command`-ot
és az argumentumait, amit a gépeden indít el. Az oda írt `url` és `headers`
figyelmen kívül marad — a szerver sosem jelenik meg, és hibát sem jelez semmi. A
dokumentáció korábbi változatai pont ezt ajánlották. Használd a plugint vagy egy
egyéni connectort; mindkettő működik Claude Desktopban.

## Saját üzemeltetésű példányok

Egy saját üzemeltetésű AgentPlaybooks szerver ugyanígy működik, ha a Supabase
Auth-jában be van kapcsolva az OAuth-szerver: add hozzá egyéni connectorként a
`https://<szervered>/api/mcp/manage` vagy `.../api/mcp/<guid>` címet. A Claude az
Anthropic infrastruktúrájából kapcsolódik, nem a gépedről, tehát a szervernek
onnan elérhetőnek kell lennie — privát hálózatban lévő szerverhez a Claude
[MCP tunneljei](https://claude.com/docs/connectors/mcp-tunnels/overview) a
támogatott út. Claude Code közvetlenül is eléri az intranetes szervert az
`apb connect`-tel, mert az a gépeden fut.

Maga a plugin az agentplaybooks.ai-ra mutat; saját szerverhez egyéni connectort
használj.

## Hibaelhárítás

- **A connector Connect vagy Reconnect feliratot mutat, nem Connected-et.** A
  belépés nem fejeződött be. Válaszd ki újra, és fejezd be az AgentPlaybooks
  belépést a megnyíló ablakban.
- **Nem jelenik meg eszköz.** Nyisd meg a connector oldalát, és nézd meg a
  **Tool permissions** részt. Ha a lista üres, bontsd a kapcsolatot, és
  csatlakozz újra.
- **Egy eszközhívást elutasít.** Az elutasítás megnevezi a hiányzó jogosultságot
  vagy az okot — például egy olvasóként veled megosztott playbookba nem lehet
  írni. Kérd meg a playbook tulajdonosát, hogy módosítsa a szerepedet.
- **Claude Code szerint a szerver hitelesítést kér.** Futtasd a `/mcp` parancsot,
  válaszd a szervert, majd az **Authenticate**-et.
