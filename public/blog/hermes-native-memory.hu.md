---
title: Hermes-memória, amit látsz, javíthatsz és megoszthatsz
description: Az AgentPlaybooks már natív Hermes memóriaszolgáltató. Tárold a tartós tudást privát playbookban, javítsd több munkameneten át, és kapcsolj hozzá megosztott tudásforrásokat.
date: 2026-09-22
author: Mate Benyovszky
---

# Hermes-memória, amit látsz, javíthatsz és megoszthatsz

Egy agent akkor válik igazán hasznossá, amikor nem kell minden beszélgetést
ugyanonnan kezdeni. A projekt nyelve magyar. Múlt héten megváltozott a telepítési
cél. Az előző munkamenetben meghozott döntés ma is érvényes. Ezeknek a tényeknek
egy új chatben is elérhetőnek kell maradniuk, és jó, ha te is látod, mit mentett
el az agent — illetve javíthatod, ha valami már nem igaz.

Az AgentPlaybooks mostantól **natív memóriaszolgáltatót kínál a Hermes Agenthez**.
Válaszd ki a Hermes memóriabeállításaiban, és kapcsolj hozzá egy privát playbookot.
A Hermes tartós tényeket menthet bele, későbbi munkamenetekben visszaolvashatja
őket, és megmutathatja a korábbi változataikat. Az emlékeket az AgentPlaybooksban
is átnézheted és javíthatod, ugyanazon a memória-API-n keresztül, amelyhez más,
általad feljogosított agentek is hozzáférhetnek.

A [korábbi Hermes-integrációnk](/blog/using-hermes-agent-with-playbooks) a
personát, a skilleket és az MCP-beállításokat viszi át a Hermes profiljába.
Ez a kiegészítés a profil használat közben keletkező memóriáját kapcsolja az
AgentPlaybookshoz.

## Az elmentett tényből szerkeszthető bejegyzés lesz

Tegyük fel, hogy megkéred a Hermest: mentse el a projekt nyelvét a
`project_language` kulcs alá. Egy későbbi munkamenetben visszaolvashatja ezt a
kulcsot anélkül, hogy az előző beszélgetésre támaszkodna. Ha a csapat másik
nyelvre vált, módosítsd a bejegyzést az AgentPlaybooksban, majd kérd meg a
Hermest, hogy olvassa újra. Az aktuális érték megváltozik, a korábbi változat
pedig megmarad az előzmények között.

A provider keresési, olvasási, írási, előzménykezelési, archiválási és végleges
törlési eszközöket ad a Hermesnek. A Hermes saját memóriaeszközével végzett új,
sikeres hozzáadásokat, cseréket és törléseket is tükrözi. Egy tükrözött tény
cseréjekor megmarad a távoli kulcs, így az előzményei is együtt maradnak.

Az archiválás elrejti a bejegyzést a normál keresés elől, de megtartja a
tartalmát. A törlés a távoli bejegyzést és annak előzményeit is eltávolítja.
A Hermes helyi `MEMORY.md` és `USER.md` fájljai továbbra is működnek: ha egy tény
mindkét helyen szerepel, a távoli szerkesztés nem írja át a helyi példányt.
Szükség esetén mindkét példányt javítani vagy törölni kell.

## Privát memória, tudatosan megosztott tudás

Kezdj **Hermes-profilonként egy külön privát playbookkal**, és adj hozzá
memóriaolvasási és -írási jogosultsággal rendelkező, playbookhoz kötött API-kulcsot.
A provider visszautasítja a személyes memória írását nyilvános vagy nem listázott
playbookba. A memóriának használt playbookot később is tartsd privátként.

A profil egyben a megosztás határa is. Aki használhatja, annak a memóriája is
közös, beleértve az üzenetküldő gateway résztvevőit. A szerző és a munkamenet
adatai segítenek megérteni egy emlék eredetét; a felhasználók elkülönítéséhez
külön profil és külön privát playbook szükséges.

Megosztott playbookokat csak olvasható tudásforrásként is felvehetsz, és a
memóriaeszközökben külön kiválaszthatod őket. A privát megosztott források saját
kulcsot kapnak. Így például egy projekt kézikönyvéből több agent is olvashat,
miközben a személyes munkamemóriájuk külön playbookban marad.

## Próbáld ki a Hermesben

Hermes 0.21.4 vagy újabb verzióval közvetlenül a repónkból telepítheted:

```bash
hermes plugins install agentplaybooks
hermes memory setup
hermes memory status
```

Válaszd az **agentplaybooks** providert, add meg a privát playbook GUID-ját,
és a Hermes titokkezelő beállításán keresztül add hozzá a kulcsát. A Hermes
Desktopban is megjelennek a natív beállítási mezők. A
[beállítási útmutató](/docs/hermes-memory) bemutatja a profilválasztást, a
megosztott forrásokat, a forrásból épített CLI használatát és egy rövid
mentés–visszaolvasás–javítás próbát.

Szeptember 23-án a Hermes
[összeolvasztotta az AgentPlaybooks katalógusbejegyzését](https://github.com/NousResearch/hermes-agent/pull/119450).
A plugin már szerepel az
[élő katalógusban](https://hermes-agent.nousresearch.com/docs/plugins/agentplaybooks)
a fenti rövid néven. Közvetlenül a
[repóból](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/hermes-memory/agentplaybooks)
is telepítheted, ha a Hermesed még nem vette át a frissített katalógust.

## Mit tud ez az első verzió?

A visszakeresés jelenleg az AgentPlaybooks szó szerinti szövegkeresésére épül.
Egy teljes kérdés nem feltétlenül szerepel a tárolt mondatokban, ezért rövid
keresőkifejezésekkel vagy ismert memóriakulccsal érdemes dolgozni. A szemantikus
keresés és a fejlettebb találati rangsorolás későbbre marad.

A provider nem tölti fel a teljes beszélgetéseket, nem nyer ki automatikusan
tényeket, és nem importálja tömegesen a meglévő helyi memóriát. Ebben a verzióban
nincs gyorsítótár, automatikus újrapróbálkozás vagy offline várólista sem:
a sikertelen műveleteket jelzi, nem teszi félre későbbi elküldésre.

Ellenőriztük a REST-működést, és a valódi Hermes-kóddal is kipróbáltuk a plugin
betöltését, a Desktop beállítási sémáját, az eszközök regisztrációját, a
memóriaírások tükrözését és a profilok közötti váltást, helyi HTTP-tesztszerverrel.
Ezek az ellenőrzések a repó
[Hermes-kompatibilitási workflow-jában](https://github.com/matebenyovszky/agentplaybooks/blob/main/.github/workflows/hermes-memory.yml)
is futnak. Automatizált integrációs próbákról van szó, nem éles fiókkal végzett
produkciós tesztről.

## Segíts alakítani a következő verziót

Próbáld ki egy kis privát playbookkal, és mondd el, mi működött jól, mi lepett
meg, és mire lenne még szükséged. Beállítási kérdéseket, a memória kezelésével
kapcsolatos észrevételeket és hibajelzéseket egyaránt várunk.
[X-en](https://x.com/agent_playbooks) és
[LinkedInen](https://www.linkedin.com/company/agentplaybooksai/) is elérsz minket;
ott ugyanúgy szívesen fogadunk kérdéseket és visszajelzéseket, mint a GitHubon.

A megvalósítás és a dokumentáció nyíltan elérhető a
[GitHub-repónkban](https://github.com/matebenyovszky/agentplaybooks). Reprodukálható
hibánál [nyiss egy issue-t](https://github.com/matebenyovszky/agentplaybooks/issues)
a Hermes verziójával és a kiváltó lépésekkel, API-kulcsok és privát
memóriatartalmak nélkül.
