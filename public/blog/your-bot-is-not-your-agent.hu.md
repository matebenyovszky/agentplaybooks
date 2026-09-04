---
title: "A botod nem az agented: hordozható csapatok Grok Bothoz és Hermes Bot Mode-hoz"
description: A Grok Bot és a Hermes Bot Mode tartós agentcsapatokat ad. Az AgentPlaybooks célja, hogy a botok mögötti identitás, skillek, eszközök és memória ne ragadjon egyetlen platformon.
date: 2026-08-18
author: Mate Benyovszky
---

# A botod nem az agented

A Grok Bot és a Hermes Bot Mode két nagyon különböző irányból jutott el
ugyanahhoz a termékötlethez: ne egyszer használatos chatként kezeljük az
agentet. Kapjon nevet és feladatot, emlékezzen, és maradjon velünk elég ideig
ahhoz, hogy valóban hasznossá váljon.

Ez komoly váltás. És sokkal sürgetőbbé teszi az agentek hordozhatóságát.

Ha heteken át tanítasz egy research Botot, összekötöd az eszközeiddel,
finomítod a skilljeit és felépíted a memóriáját, akkor az az agent már a tiéd?
Vagy csak egy konfiguráció, amely bent ragadt abban a runtime-ban, ahol
létrehoztad?

A mi állításunk egyszerű:

> A bot az a hely, ahol az agent fut. Maga az agent maradjon a tiéd.

## Két fontos megjelenés

Az augusztus 11-én early betaként bejelentett
[Grok Bot](https://x.ai/news/introducing-grok-bot) minden Botnak saját felhős
számítógépet ad. Be tud lépni weboldalakra és alkalmazásokba, API vagy MCP
nélküli felületeken is képes dolgozni, folytatja a munkát, amikor már nem vagy
a gépnél, bemutatásból tanul rutinokat, és más Botokkal közvetlenül vagy
csoportos chatben is együttműködik.

A [Hermes Bot Mode](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/bot-mode.md)
nyílt, profil-alapú utat választ. Egy Hermes Bot valójában egy Hermes profile,
saját modellel, `SOUL.md`-vel, memóriával, skillekkel, credentialökkel,
MCP-konfigurációval, sessionökkel, cron rutinokkal és avatarral. A Botok
üzenhetnek egymásnak, csoportban dolgozhatnak, és akár külön gépeken is
futhatnak úgy, hogy egy közös desktop rosterben jelennek meg.

| | Grok Bot | Hermes Bot Mode |
|---|---|---|
| Runtime | Menedzselt felhős számítógép | Nyílt forrású lokális, távoli vagy felhős runtime |
| Eszközhasználat | Appokon és weboldalakon keresztül, API nélkül is | Natív toolok, Agent Skills, MCP, terminál backendek |
| Tartós állapot | Beszélgetések, tanult preferenciák, bemutatott rutinok | Profilfájlok, memória, sessionök, cron jobok, konfiguráció |
| Csapat | Párhuzamos Botok, DM-ek, group chat | Profilok, bot-to-bot üzenetek, group chat, többgépes peerek |
| Hordozhatóság | A beta bejelentésében még nincs dokumentált export | Profile export és Hermes-specifikus Git distribution |

Mindkettő értékes. Egyik sem platformsemleges forrás több runtime számára.

## A hiányzó réteg nem egy újabb agent runtime

Az AgentPlaybooksnak nem a Grok Bot computer use-ával vagy a Hermes
runtime-jával kell versenyeznie. Ezek a rendszerek végrehajtják a munkát. A
hiányzó elem a fölöttük lévő hordozható control plane.

Az általunk javasolt modell:

- **Egy playbook egy agentet definiál:** identitás, instrukciók, skillek, MCP-
  és OpenAPI-kapcsolatok, memóriapolitika és secret-követelmények.
- **Egy deployment valahol futtatja ezt a playbookot:** Hermes profile-ként,
  Grok Botként vagy más agent runtime-ban.
- **Egy team manifest több playbookot kapcsol össze:** szerepek, csoportok,
  handoffok, közös erőforrások és időzített rutinok.

A deployment változhat anélkül, hogy az agent definícióját át kellene írni.
Ugyanaz a researcher futhat Hermesben a saját gépeden, átkerülhet egy hétre
egy menedzselt Botba, vagy használhatod mindkét helyen egyszerre. A runtime
megtarthat lokális végrehajtási állapotot, de a kanonikus definíció és a
kiválasztott tartós tudás a te irányításod alatt marad.

Ez az eredeti vendor-lock-in mentes ígéretünk, egy agentről teljes csapatokra
kiterjesztve.

## Mi működik ma?

Az AgentPlaybooks minden playbookot MCP-n és OpenAPI-n keresztül is elérhetővé
tesz. A runtime beolvashatja a personát és az instrukciókat, felfedezheti a
skilleket és kapcsolt toolokat, dolgozhat tartós memóriával, és runhoz kötött
canvasra írhatja az eredményeket. A user control plane új playbookot is létre
tud hozni, majd azonnal alkalmazhatja annak teljes műveletkészletét.

A CLI jelenleg standard Agent Skills fájlokat szinkronizál a Hermes skill
tárába. A Hermes egy hosztolt playbookhoz remote HTTP MCP-ként is kapcsolódhat.
Ez már használható, de még nem teljes Bot Mode deployment: a CLI ma nem hoz
létre névvel ellátott Hermes profile-t, és nem képezi le automatikusan a teljes
playbookot annak `SOUL.md`, MCP, cron és metadata rétegeibe.

A Grok Bot integrációs szempontból korábbi fázisban van. A bejelentés szerint
a Bot weboldalakon és appokban tiszta API vagy MCP nélkül is tud dolgozni, így
az AgentPlaybooks webes felületét vagy publikus exportjait már használhatja.
Az xAI viszont a bejelentésben még nem dokumentált külső Bot API-t, MCP
csatlakozási pontot vagy import/export formátumot. Nem fogunk natív
connectort ígérni addig, amíg nincs hozzá támogatott felület.

## Mit építsünk meg következőként?

Az első konkrét adapter a Hermes profile deployment legyen, mert ennek nyílt
és egyértelmű primitívjei vannak:

| Playbook | Hermes profile |
|---|---|
| Persona | `SOUL.md` |
| Skillek | `skills/<name>/SKILL.md` |
| MCP-szerverek | profile `mcp.json` / `config.yaml` |
| Secret-követelmények | `.env.EXAMPLE` hivatkozások, secret-értékek nélkül |
| Rutinok | profile `cron/` jobok |
| Deployment metadata | distribution metadata és sync hash |

A parancs először tervet készítsen, és ne írjon felül csendben semmit:

```bash
apb deploy <playbook> --target=hermes --profile=researcher
apb deploy <playbook> --target=hermes --profile=researcher --apply
```

Ezután kell a deployment rekord és a drift-jelentés: melyik playbook-verzió hol
fut, mit változtatott meg lokálisan a runtime, és ezt visszahúzzuk,
felültöltjük vagy tudatosan eltérőnek hagyjuk-e.

A Grok Bothoz rövid távon egy scope-olt hozzáférési link a biztonságos híd,
amely egy Botnak egy playbookhoz ad jogot, nem egy teljes account API-kulcsot.
Natív adapter akkor következzen, amikor az xAI támogatott Bot API-t vagy
hordozható konfigurációs felületet publikál.

## Amit validálni szeretnénk

Az érdekes kérdés már nem az, hogy az emberek használnak-e tartós AI
csapattársakat. A Grok és a Hermes is erre fogadott.

A kérdés az, hogy szeretnéd-e, hogy a csapattárs mögötti agent túléljen egy
runtime-váltást.

Használnál egyetlen platformsemleges definíciót ugyanahhoz a Bothoz Hermesben,
Grokban, coding agentekben és későbbi runtime-okban? A csapat különálló
playbookok gyűjteménye legyen, vagy egyetlen nagy bundle? A memória mely része
utazzon, és melyik maradjon privát végrehajtási állapot?

Nyíltan építjük. Olvasd el az
[integrációs tervet](/docs/bot-platform-integrations), nézd meg a
[GitHub repót](https://github.com/matebenyovszky/agentplaybooks), és mondd el,
hol törik el az absztrakció.
