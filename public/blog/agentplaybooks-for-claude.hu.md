---
title: A playbookjaid minden Claude-ban — egy plugin, API-kulcs nélkül
description: Az AgentPlaybooks kapott egy Claude-plugint és egy OAuth-os connectort. A fiókod minden playbookja elérhető claude.ai-on, Claude Desktopban, Cowork-ben, Claude Code-ban és mobilon — semmit nem kell bemásolni, és titkot a Claude soha nem lát.
date: 2026-09-30
author: Mate Benyovszky
---

# A playbookjaid minden Claude-ban — egy plugin, API-kulcs nélkül

Mostanáig a „hogyan használom a playbookomat Claude Desktopban?" kérdésre az
őszinte válasz az volt: rendesen sehogy. A saját dokumentációnk mást mondott.
Azt tanácsolta, hogy írj be egy URL-t és egy `Authorization` fejlécet a
`claude_desktop_config.json`-ba — egy olyan fájlba, amely csak *helyi*
programokat ír le. A Claude Desktop figyelmen kívül hagyta a bejegyzést, nem
szólt semmit, a szerver pedig sosem jelent meg. Négy dokumentációs oldal és a
dashboard ismételte ugyanezt.

Ez most megjavult, és a megoldás sokkal jobb lett, mint a kerülőút, amivel
elindultunk.

## Mi változott

**Minden playbook-végpont OAuth-tal védett erőforrás lett.** Bármely kliens, amely
ismeri az MCP-hitelesítést, a `https://agentplaybooks.ai/api/mcp/<guid>` címre —
vagy a teljes fiókhoz a `/api/mcp/manage`-re — irányítva maga megtalálja a
bejelentkezést, regisztrálja magát, és megkér, hogy lépj be. Nincs létrehozandó,
másolandó, beillesztendő vagy cserélendő kulcs. Ez működik claude.ai-on, Claude
Desktopban, Cowork-ben, a mobilappokban, Claude Code-ban, Cursorban és VS Code-ban.

**Van Claude-plugin.** Három dolgot csomagol egybe:

- a **fiók-connectort**, így minden playbook, ami a tiéd vagy megosztották veled,
  egyetlen kapcsolaton át elérhető — azt is beleértve, amit egy kolléga a jövő
  héten oszt meg veled;
- egy **playbooks skillt**, amely megtanítja a Claude-nak a közös playbookhoz
  szükséges szokásokat: előbb keresd meg a jó playbookot, vedd fel a personáját,
  ha kérik, a tartós tényeket tedd memóriába ahelyett, hogy ismételgetnéd, és
  kérdezz, mielőtt olyat módosítasz, amire mások is építenek;
- **`/agentplaybooks:doctor` és `/agentplaybooks:sync`** parancsokat Claude
  Code-hoz, amelyek egy projekt agent-konfigurációs fájljait auditálják és
  szinkronizálják.

A claude.ai-on hozzáadott plugin a fiókodhoz kerül, így ott van chatben,
Cowork-ben és — a következő munkamenet indulásakor — Claude Code-ban is, újbóli
telepítés nélkül.

## Hogyan kapod meg

**Ma, a repóból.** claude.ai-on vagy az asztali appban nyisd meg a **Customize →
Plugins → Add → Add marketplace** menüt, írd be:
`matebenyovszky/agentplaybooks`, és add hozzá az AgentPlaybookst. Utána a plugin
**Connectors** fülén válaszd a **Connect**-et. Claude Code-ban:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

**Az Anthropic directoryjából.** A plugin a directory szabályai szerint készült,
és most megy felülvizsgálatra. Ha listázzák, a **Discover** alatt jelenik meg Pro,
Max, Team és Enterprise előfizetésen.

**Csak egy playbook kell?** Add hozzá egyéni connectorként a **Customize →
Connectors** alatt, a playbook **Integrations** fülén található URL-lel. Ez az út a
playbook personáját és utasításait is érvényesíti, a szerver saját promptjaként.
Az Integrations fülön most már ott vannak a Claude-lépések és az egy-kattintásos
gombok Cursorhoz és VS Code-hoz.

Minden benne van az új útmutatóban: [AgentPlaybooks a Claude-ban](/docs/claude).

## Mit tehet vele a Claude, és mit nem

A connector a nevedben jár el, és nem többet: azt éri el, amit a fiókod. Minden
eszköz megmondja magáról, hogy csak olvas-e, így a Claude az olvasásokat —
listázás, keresés, egy playbook megnyitása — kérdezés nélkül futtathatja, és
megkérdez, mielőtt olyan eszközt hív, amely módosít valamit, hacsak nem
engedélyezted az adott eszközt véglegesen. A törlés és a csatolt szolgáltatások
hívása rombolóként (destructive) van megjelölve.

A hitelesítő adatok ott maradnak, ahol vannak. A `list_secrets` csak neveket ad
vissza. A `use_secret` megkéri az AgentPlaybooks szervert, hogy a kérést ott,
a titkot beillesztve küldje el, és csak a válasz jön vissza. A kulcsot a Claude
soha nem látja, és a beszélgetés átirata sem.

## A kitérő, amit nem adtunk ki

Ez augusztus 21-én egy Claude Desktop kiegészítőként indult: egy `.mcpb` csomag
egy kis helyi híddal, amely minden üzenetet továbbított a hosztolt végpontra, az
API-kulcsot pedig az asztali app beállításaiba kellett beírni. Működött. Kiadva
mégsem lett, két okból, amelyek mind a ketten megérkeztek, amíg várt. A végpont
megkapta az OAuth-ot, amitől a híd feleslegessé vált mindenütt, ahol segíteni lett
volna hivatott. Az Anthropic directoryja pedig már nem fogad kiegészítőket
listázásra — a helyi szerverek ma pluginek belsejében utaznak —, így terjesztési
szempontból zsákutca lett.

Abból az ágból az maradt meg, aminek soha nem volt köze a kiegészítőhöz: a
dokumentáció kijavítása, amely egy működésképtelen konfigurációs fájlhoz küldte
az embereket, és az egy-kattintásos szerkesztő-gombok.

## A directory szabályai szerint építve

Két dolog a meglévő pluginban teljesen kizárta volna a claude.ai-ról — érdemes
tudni róluk, ha te is építesz egyet:

- **A gyökérben lévő `bin/` mappa miatt a claude.ai és a Cowork az egész plugint
  elutasítja.** A CLI-pluginunk így szállította a futtatható állományát. A
  Claude-plugin nem tartalmaz futtatható fájlt; a parancsai a kiadott CLI-t
  `npx`-szel futtatják, pontosan arra a verzióra rögzítve, amellyel a plugin
  megjelent, és a kiadási ellenőrzés elbukik, ha egy rögzítés lemarad.
- **Minden eszköznek kell egy cím, és a csak-olvasó illetve romboló jelzője.** A
  directory portálja ezekből dönti el, mit futtathat a Claude kérdés nélkül.
  Mind az ötven eszközünk deklarálja mindkettőt, és egy teszt elbuktatja a
  buildet, ha valamelyik abbahagyja.

A plugin tizennégy kilobájtnyi markdown és JSON. Minden, amit csinál, benne van a
[plugin README-jében](https://github.com/matebenyovszky/agentplaybooks/tree/main/plugins/agentplaybooks).
