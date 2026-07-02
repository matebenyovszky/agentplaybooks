---
title: A Nous Hermes használata az AgentPlaybooks-al
description: Tanuld meg, hogyan kötheted össze az erős nyílt forráskódú Nous Hermes ügynök modellt a Playbookjaiddal MCP és OpenAPI segítségével.
date: 2026-06-15
author: Mate Benyovszky
---

# A Nous Hermes használata az AgentPlaybooks-al

A nyílt forráskódú modellek hihetetlen fejlődésen mentek keresztül az eszközhasználat (tool-calling) és a logikai következtetés terén. A **Nous Hermes** (például a Hermes 3) kifejezetten fejlett ügynök (agentic) munkafolyamatokra és funkcióhívásokra lett finomhangolva, ami tökéletes társsá teszi az AgentPlaybooks számára.

Ebben az útmutatóban bemutatjuk, hogyan használhatod a Hermes ügynök modellt a Playbookoddal, hogy tartós memóriát, személyiséget (Persona) és biztonságos MCP eszközökhöz való hozzáférést biztosíts neki.

## 🤖 Miért pont a Hermes?

A Hermes modellcsalád a következő területeken jeleskedik:
- **Komplex rendszer-promptok követése**: Tökéletesen átveszi a Playbookod személyiségét (Persona).
- **Funkcióhívás**: Natívan megérti a JSON sémákat, és megbízhatóan képes aktiválni a Playbookod Képességeit (Skills) és MCP szervereit.
- **Autonómia**: Képes többlépéses terveket végrehajtani anélkül, hogy hallucinálna az eszközök bemeneteinél.

A Hermes és az AgentPlaybooks kombinálásával kitörheted a modellt az izolált, állapotmentes chat dobozából, és egy valódi operációs környezetet biztosíthatsz neki.

## 🔌 Csatlakozási Módok

Mivel a Hermest gyakran lokálisan futtatják (Ollama vagy LM Studio segítségével), vagy felhőszolgáltatókon keresztül érik el (mint az OpenRouter), két fő módon tudod összekötni az AgentPlaybooks-al.

### 1. Módszer: Model Context Protocol (MCP)

Ha egy MCP-kompatibilis klienst használsz a Hermes futtatására, a Playbookodat közvetlenül MCP szerverként kötheted be.

1. Hozz létre egy **Playbook API Kulcsot** az AgentPlaybooks vezérlőpultján.
2. A lokális MCP kliensed konfigurációjában add hozzá a Playbookod végpontját:
   ```json
   "mcpServers": {
     "my-playbook": {
       "command": "npx",
       "args": ["-y", "@agentplaybooks/mcp-client", "https://apbks.com/api/mcp/A_TE_PLAYBOOK_GUID_AZONOSITOD"],
       "env": {
         "PLAYBOOK_API_KEY": "apb_live_xxxxxxxxxxx"
       }
     }
   }
   ```
3. Indítsd el a klienst a Hermes modellel. A Hermes azonnal beolvassa a biztosított erőforrásokat (`resources`, azaz a Playbookod Vászna és Memóriája) és megérti az elérhető eszközöket (`tools`, azaz a Képességeid és külső integrációid).

### 2. Módszer: OpenAPI Funkcióhívás

Ha egyedi Python vagy Node.js szkriptet írsz a Hermes irányítására (pl. `llama-cpp-python` vagy az OpenAI-kompatibilis OpenRouter API használatával), dinamikusan lekérheted a Playbookod OpenAPI specifikációját.

```bash
curl "https://apbks.com/api/playbooks/A_TE_PLAYBOOK_GUID_AZONOSITOD?format=openapi"
```

1. Parseold ezt az OpenAPI JSON-t szabványos OpenAI funkciódefiníciókká.
2. Add át ezeket a funkciókat a Hermes modellnek a `tools` tömbben a chat kérésednél.
3. Szerepeltesd a Playbookod Személyiségét (Persona) `system` üzenetként.
4. Amikor a Hermes úgy dönt, hogy meghív egy eszközt, a te szkripted hajtja végre a HTTP kérést az AgentPlaybooks API felé az API Kulcsod használatával.

## 🛡️ Biztonságos Végrehajtás

Függetlenül attól, hogy MCP-t vagy OpenAPI-t használsz, a Hermes örökli az AgentPlaybooks összes biztonsági funkcióját. Ha a Hermesnek egy külső API-val kell interakcióba lépnie (mint a GitHub vagy egy adatbázis), használhatja a **Secrets Vault**-ot (Titkok Tárháza).

A Hermes sosem fogja látni a nyers API kulcsaidat. Helyette a `use_secret` eszközt fogja használni, hogy megkérje a Playbookot a kérés végrehajtására a nevében, ezzel biztosítva a nulla kitettségű hitelesítőadat-kezelést.

## Következő Lépések

Kombináld a Hermest a [Platform Integrációinkkal](/docs/platform-integrations), hogy lásd, hogyan építhetsz egy valóban autonóm, nyílt forráskódú ügynök munkafolyamatot még ma!
