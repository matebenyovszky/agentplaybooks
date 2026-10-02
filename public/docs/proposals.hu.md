# Javaslatok

Emberek és ügynökök írási jog nélkül is javasolhatnak változást egy playbookba.
A **javaslat** egy skill-módosítás vagy egy memória-bejegyzés, amely a playbook
tulajdonosára vagy egy szerkesztőjére vár. Amíg valaki jóvá nem hagyja, semmi
nem íródik be.

Tipikus felhasználás:

- Egy csapat ügynökei általánosított tanulságokat javasolnak egy közös
  tudás-playbookba (például: „az EKR-részeket az eljárás azonosítója és a rész
  száma alapján kapcsold össze”), és egy kurátor dönti el, mi lesz közös.
- A kollégák javítást javasolnak a szervezet skilljeihez, és a skill
  karbantartója átnézi.

## Ki mit tehet

| | Beküldés | Olvasás és döntés |
|---|---|---|
| Playbook API-kulcs **Proposer** szereppel (`proposals:write`) | ✅ | ❌ — a saját javaslatait sem látja |
| Tulajdonos vagy szerkesztő (webes munkamenet vagy user API-kulcs) | ✅ | ✅ |
| Bárki más | ❌ | ❌ |

A jóváhagyás emberi döntés. Playbook API-kulcs soha nem hagyhat jóvá, így egy
kulcsot használó ügynök a saját javaslatát sem fogadhatja el.

## Beküldés

A playbook **Integrations** fülén hozz létre egy kulcsot **Proposer**
szereppel. Utána:

```bash
curl -X POST https://agentplaybooks.ai/api/playbooks/GUID/proposals \
  -H "X-API-Key: apb_..." -H "Content-Type: application/json" \
  -d '{
        "kind": "memory",
        "payload": { "key": "lesson/ekr-natural-key",
                     "value": { "text": "Az EKR-részeket az (eljarasAzonosito, reszSzama) pár köti össze." },
                     "summary": "EKR természetes kulcs", "tier": "longterm", "tags": ["ekr"] },
        "rationale": "Részszintű szerződésértékek egyeztetésekor derült ki"
      }'
```

A skill-javaslat a teljes skillt tartalmazza:

```json
{ "kind": "skill",
  "payload": { "name": "ekr-data-gathering", "description": "…", "content": "# …" },
  "rationale": "Kiegészíti a dátumtömbös buktatóval" }
```

A válasz: `{ "id", "status": "pending", "created_at" }`. Egy playbooknak
legfeljebb 500 függő javaslata lehet. Ezen felül a beküldés `429`-et kap, amíg
valaki át nem nézi őket.

## Áttekintés

A javaslatok a playbook **Javaslatok** fülén jelennek meg a tulajdonosnak és a
szerkesztőknek. A fül egymás mellett mutatja a jelenlegi és a javasolt
változatot. Jóváhagyhatod vagy elutasíthatod, megjegyzéssel is.

- **Skill jóváhagyásakor** az azonos nevű skill frissül, vagy ha nincs ilyen,
  létrejön. Az előző szöveg a skill verziótörténetében marad, így
  visszaállítható.
- **Memória jóváhagyásakor** a kulcs értéke beíródik. Az előző érték a
  memória-előzményekben marad, és a bejegyzés jelzi a forrást:
  `metadata.source = "proposal"`.
- Ugyanazt a javaslatot ketten nem alkalmazhatják kétszer. Ha az alkalmazás
  sikertelen, a javaslat visszakerül függő állapotba.

Minden beküldés és döntés bekerül a playbook auditnaplójába (`proposal.submit`,
`proposal.approve`, `proposal.reject`). A napló csak a fajtát és a célt (a
skill nevét vagy a memória kulcsát) őrzi meg, a javasolt tartalmat soha.

### API

| Metódus | Útvonal | Ki |
|---|---|---|
| `POST` | `/api/playbooks/:guid/proposals` | `proposals:write` |
| `GET` | `/api/playbooks/:guid/proposals?status=pending\|approved\|rejected\|all` | tulajdonos, szerkesztő |
| `GET` | `/api/playbooks/:guid/proposals/:id` | tulajdonos, szerkesztő; `current`-tel együtt |
| `PATCH` | `/api/playbooks/:guid/proposals/:id` `{ "decision": "approve"\|"reject", "note" }` | tulajdonos, szerkesztő |

User API-kulccsal az olvasáshoz `playbooks:read` kell. A döntéshez a javaslat
fajtájától függően `skills:write` vagy `memory:write`, ugyanúgy, mint a közvetlen
íráshoz.
