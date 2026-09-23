# Portolható agentek a Hermesben

![AgentPlaybooks Portable Agents pluginkép](/plugin-catalog/portable-agents.png)

Az AgentPlaybooks segítségével a Hermes-agent ellenőrizheti,
szinkronizálhatja, csomagolhatja és visszaállíthatja a konfigurációját.
Az **AgentPlaybooks Portable Agents** Hermes-plugin ehhez ad egy skillt,
amely a kiadott `apb` CLI-t használja. A plugin különálló a
[natív memóriaszolgáltatótól](./hermes-memory.md).

A hordozhatósági plugin kérésre működik. Telepítéskor nem indít háttérben
ütemezett automatizmust, nem ad új modell-eszközt, és nem írja át a Hermes
profilját. A katalógusban **Tools** kategóriába illik, mert a CLI
konfigurációkezelő eszközeinek használatát segíti.

## Telepítés

Az új Hermes-katalógusbejegyzés karbantartói ellenőrzésre vár. Addig a repó
megfelelő alkönyvtárából telepítheted:

```bash
hermes plugins install matebenyovszky/agentplaybooks/packages/hermes-portable/agentplaybooks-portable --no-enable
hermes plugins enable agentplaybooks-portable
npm install -g @agentplaybooks/cli@0.4.0
apb --version
```

Node.js 20 vagy újabb szükséges. Aktiválás után a Hermes az
`agentplaybooks-portable` skillt a `skills_list` és `skill_view` eszközökön
keresztül éri el. Az npm CLI külön előfeltétel, amelyet a kezelő telepít.
Helyi ellenőrzéshez és szinkronizáláshoz nem kell távoli fiók; a központi
playbookok letöltéséhez és feltöltéséhez `apb login` szükséges.

Ha a katalógusbejegyzést elfogadták és közzétették, az első parancs helyén
`hermes plugins install agentplaybooks-portable` használható.

## Használat

Egy projekt könyvtárából:

```bash
apb doctor .                          # konfiguráció és eltérések ellenőrzése
apb sync . --target=hermes            # Hermes-profil változásainak előnézete
apb sync . --target=hermes --apply    # az átnézett terv alkalmazása
```

Ha központi playbookból Hermes Bot Mode profilt készítesz, először futtasd
az `apb login` parancsot, majd nézd át és alkalmazd a letöltési és exportálási
tervet:

```bash
apb pull <guid> .
apb pull <guid> . --apply
apb export hermes ./bots/research
apb export hermes ./bots/research --apply
hermes profile install ./bots/research --name research
apb sync --target=hermes --profile=research --apply
```

A CLI szabványos Agent Plugins 1.0 skillfákat, egyéni agenteket és
MCP-hivatkozásokat is csomagolhat az
`apb plugin export . --output=<dir>` paranccsal. A titkok értékei helyben
maradnak. A tervet készítő parancsok csak olvasnak; az `--apply` az átnézett
terv alapján ír. Részletek a [CLI-útmutatóban](./cli.md) és a
[Bot Mode telepítési útmutatóban](./bot-platform-integrations.md).
