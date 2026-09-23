# Platformközi AI-ügynök konfiguráció és központi mentés

Az AgentPlaybooks a támogatott AI-kódoló ügynökök között hordozható munkakészletet képez. Az `apb doctor` auditálja a helyi konfigurációt, az `apb sync` egységesíti és a célplatform fájlformátumába alakítja, az `apb push` pedig privát, változatlan mentési verziót tárol központilag. Másik gépen az `apb pull` visszaállítja a készletet, majd a `sync` kitelepíti a kívánt kliensekhez.

Ez **AI agent migrációra**, **Agent Skills mentésre**, **egyedi ügynökök hordozására** és **MCP konfiguráció helyreállítására** alkalmas. A közös konfigurációs modellt hidalja át; nem ígéri, hogy minden gyártóspecifikus funkció minden platformon azonosan működik.

## Mi kerül a mentésbe?

- A kiválasztott projektutasítás `AGENTS.md`-ként és az `agentplaybook.json` manifest.
- A teljes Agent Skills könyvtár: `SKILL.md`, szkriptek, hivatkozások és bináris assetek.
- Hordozható egyedi ügynökök közös promptmezőkkel és támogatott platformspecifikus kiegészítésekkel.
- MCP-szerver definíciók és titok**hivatkozások**, például `${DOCS_TOKEN}`; a CLI nem kéri le a széfben tárolt értékeket.
- Az opcionális hordozható persona fájl.

A mentés a playbook GUID-jához kötött, verziózott, privát, és a tulajdonos számára a playbook rekord törlése után is helyreállítható. A szerver útvonalat, ellenőrzőösszeget, darabszámot, méretet és nyilvánvaló beégetett hitelesítőadatokat ellenőriz. A jelenlegi korlát 1000 fájl, összesen 4 MiB, fájlonként 1 MiB.

Tetszőleges skill-asseteknél a hitelesítőadat-felismerés csak heurisztikus lehet. Feltöltés előtt nézd át a tervet és a skill fájljait; titkot ne tegyél a forrásanyagba.

A `CLAUDE.local.md`, `settings.local.json`, jogosultsági beállítások, hookok, worktree-k és tetszőleges alkalmazásadatok nem részei ennek a hordozható mentésnek. A hosztolt OpenAPI-federáció és egy kliens fiókszintű MCP-kapcsolata sem mindig képezhető le helyi fájlra.

## Mentés és visszaállítás

```bash
apb doctor . --strict
apb push .                 # feltöltési terv ellenőrzése
apb push . --apply         # hosztolt rekordok + privát hordozható mentés
apb backups PLAYBOOK_GUID  # mentési verziók azonosítói

apb pull PLAYBOOK_GUID ../visszaallitott --apply
apb sync ../visszaallitott --target=claude,cursor,codex,copilot,gemini --apply

# Korábbi verzió visszaállítása:
apb pull PLAYBOOK_GUID ../korabbi --snapshot=SNAPSHOT_ID --apply
```

A `push` konfliktus esetén nem tölt fel hiányos mentést. A `pull` a hiányzó fájlokat létrehozza, az eltérő meglévő fájlokat konfliktusként jelzi, nem írja felül csendben. Törölt playbook esetén a tulajdonos GUID alapján visszaállíthatja a legutóbbi mentést, majd új playbookba pusholhatja.

A központi mentés kiegészíti a hosztolt playbook élő skilljeit és MCP-eszközeit. Nem helyettesíti a Git-repót vagy a titokszéf mentését. A helyreállításhoz ugyanahhoz a fiókhoz tartozó API-kulcs kell.

## Mely platformokra épít hidat?

A helyi adapterek a Claude Code, Cursor, OpenAI Codex, GitHub Copilot, Gemini CLI, Google Antigravity, Grok Bot és Hermes Agent platformokat fedik le. Az Agent Plugins 1.0 import/export külön csomagútvonal a hordozható skillekhez és MCP-szerverekhez. Az egyedi ügynököket az AgentPlaybooks kiegészítése hordozza, a CLI pedig natív célformátumra fordítja.

A közös mezők átvihetők; a csak egy kliensre jellemző mezők ott maradnak meg, ahol reprezentálhatók, a nem támogatott elemeket jelezzük. Például a Grok Bot fiókszintű MCP Boxa nem telepíthető projektfájlból. Visszaállítás után az `apb doctor` mutatja a maradék eltéréseket. Pontos fájltérkép: [CLI és szerkesztő-pluginok](/docs/cli), [platformintegrációk](/docs/platform-integrations).
