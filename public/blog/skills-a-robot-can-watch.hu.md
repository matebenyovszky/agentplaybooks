---
title: "Skillek, amiket egy robot megnézhet: playbookok testtel bíró agenteknek"
description: Egy skill mostantól rámutathat a saját elvégzéséről készült felvételekre. Azoknak a robotmodelleknek, amelyek egyetlen bemutatásból tanulnak meg egy feladatot, ez a felvétel maga a skill — a playbook pedig az, ami sorrendben tartja őket.
date: 2026-10-13
author: Mate Benyovszky
---

# Skillek, amiket egy robot megnézhet

Az AgentPlaybooks nem újabb skill store, és nem újabb MCP-registry. A skillek és
az MCP-kapcsolatok egy playbook részei. A playbook maga a teljes munkakör: az
eljárások, a persona, a memória, a kapcsolatok, és azok a titkok, amelyeket az
agent úgy használ, hogy sosem látja őket — egy helyen, amely egyetlen vendoré
sem.

Ez a megközelítés eddig a szoftveres agentekről szólt, amelyek a Claude Code, a
Cursor, a Codex, a Hermes és a következő platform között mozognak. Kiderült, hogy
a testtel bíró agenteknél még többet számít.

## Miért most

A robotikai alapmodellek egy formára konvergáltak: egy nagy látás-nyelvi modell
tervez, egy kicsi, gyors policy mozgat. Mindegyik komoly modellt nyelv irányítja.
Ettől egy szöveges playbook már ma hasznos egy robot tervező rétegének.

Az újabb fordulat a bemutatásokról szól. A Generalist AI
[GEN-1.5](https://generalistai.com/blog/gen-1.5)-e egy ügyességet igénylő
feladatot egyetlen, a kontextusába tett bemutatásból tanul meg, tréning nélkül.
Több bemutatás egyetlen folyamatos viselkedéssé fűzhető, és egy ember saját
kezével felvett bemutatás is átvihető a robotra.

Tárolási szemmel ebből két dolog következik:

- **A bemutatás nem dokumentáció a skill mellett. A bemutatás maga a skill.**
  A modell futás közben tölti be.
- **A bemutatások sorrendje maga a program.** Valaminek meg kell őriznie ezt a
  sorrendet, verzióznia kell, és oda kell adnia annak a robotnak, amelyik éppen
  dolgozik.

Ez a valami a playbook.

## Mit hordoz most egy skill

Egy skill rámutathat a saját elvégzéséről készült felvételekre. Ezek a `SKILL.md`
frontmatterében élnek, közvetlenül az eljárás mellett, amit bemutatnak:

```yaml
---
name: open-fire-door
description: Tűzgátló ajtó nyitása kilinccsel, két kézzel
demonstrations:
  - provider: youtube
    ref: dQw4w9WgXcQ
    title: Kétkezes nyitás
    segments:
      - { start: 134, end: 158, label: kilincs megfogása, comment: alulról }
      - { start: 158, end: 171, label: testsúly áthelyezése, comment: az ajtó nehéz }
  - provider: url
    ref: https://example.org/recordings/fire-door-push.mp4
    sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
  - provider: hf_dataset
    ref: example-lab/fire-door-push@a1b2c3d
---

## Eljárás

1. Állj az ajtó forgáspontjától 60 cm-re.
```

A lista rendezett, mert a sorrend a végrehajtás sorrendje. Minden bejegyzés
megmondja, hol van a felvétel, és opcionálisan azt is, melyik pillanatai
számítanak.

- **Két hűségi szint, egy blokk.** A `video` referencia pixeleket hordoz. A
  `sensorimotor` referencia — jellemzően egy LeRobotDataset-epizód — mozgást és
  propriocepciót is. Ugyanaz a dolog két felbontásban.
- **Felvétel arról, mit ne csinálj.** A `role: warning` egy hibamódot jelöl. Egy
  modell, amely egyetlen bemutatásból tanul, *bármelyik* bemutatásból tanul, amit
  elé tesznek, ezért az exportok kimondják, hogy ezt nem szabad megismételni.
- **Rögzített bájtok.** Egy URL azt mondja meg, hol van a felvétel, azt nem, hogy
  mi. A `sha256` a fájlt rögzíti, így a publikálás után kicserélt felvétel
  felismerhető.

Nincs új tábla, új végpont, új MCP tool. A bemutatások ugyanabban a dokumentumban
vannak, mint az eljárás, ezért a kettő egy diffben látszik, együtt verziózódik, és
együtt áll vissza.

## Minden olvasó azt kapja, amit használni tud

Semmi nincs itt, ami külön termék lenne a robotoknak. Minden fogyasztó ugyanazt a
skillt olvassa:

- A `get_skill` MCP-n feloldva adja vissza a bemutatásokat, felvételenként és
  időbélyeges szegmensenként egy-egy linkkel.
- A markdown-export időbélyeges listaként írja ki őket a dokumentum fölé, így egy
  csak szöveget olvasó agent is megtudja, hogy léteznek, és milyen sorrendben.
- Az `apb doctor` push előtt jelzi a hibás blokkot. A dashboard skill-szerkesztője
  gépelés közben mutatja, mire oldódott fel a blokk, ugyanazzal a parserrel, mint a
  szerver.
- Az `apb sync` a playbook manifestjében skillenként felsorolja a felvételeket,
  így a playbook még futtatás előtt megmondja, milyen hostokat kell elérnie egy
  agentnek.
- Egy kliens, amely nem ismeri a kulcsot, semmit nem veszít: a próza továbbra is
  maga a skill.

## Memória, amely tudja, hol történt

Egy robot memóriája epizodikus: mit csinált, hol, és hogyan sikerült. Egy memória
mostantól ugyanabban az alakban hordozhat felvételt az epizódról, mint egy skill,
a `metadata.recording` alatt, és a `metadata.episode` alatt megmondhatja, hol
történt. Hogy mikor, az a memória saját `memory_at` ideje.

A közös alak szándékos. Egy sikeres futás, felvéve és megjegyezve, átemelhető egy
skill bemutatásai közé. A memóriából skill lesz.

Az írott összefoglaló marad a csereformátum. Ezt találja meg a keresés, és ezt
olvassa egy csak szöveget értő agent. A felvétel mindig csak mutató mellette,
sosem helyettesíti.

## Titkok egy épülethez, nem csak egy API-hoz

Egy telepített robotnak olyan titkok kellenek, amelyekre egy szoftveres agent nem
is gondol: lift- és ajtó-API-k, belépés, flottatokenek, WiFi. Ezek két csoportba
esnek, és a vault már mindkettőt kezeli.

- **A legtöbbjüknek sosem kell eljutnia a robothoz.** A lift- és beléptető-API-k
  hétköznapi HTTPS-t és OAuth-t használnak, így a robot a `use_secret`-en át hívja
  őket, a tokent pedig a szerver illeszti be. A robot sosem tartja a kezében.
- **Néhányat ki kell adni**, például egy WiFi-jelszót, amit a robotnak a saját
  hálózati stackjébe kell begépelnie. Ezek a szűk, szándékosan megjelölt kivételek.

Egy kiadott értéket nem lehet visszavenni, ezért ami valóban véd: titkonként
külön, kifejezett engedély a kiadásra, teljes audit-napló, rotáció — és egy
lejárat, amelyet a rendszer tényleg be is tart. Egy lejárt titkot mostantól minden
útvonal visszautasít, amely használná.

## Amit szándékosan nem építettünk meg

Alaposan megvizsgáltunk egy MQTT-hidat a VDA 5050-es flottákhoz, és elvetettük.
Az AgentPlaybooks állapotmentes kérésekként fut, a bróker-kapcsolatok tartása
pedig a rendszer egyetlen állapotos komponensét hozná be, egy olyan világ
kedvéért, amely nem az első célközönség.

Helyette ez a minta: **a kapcsolatot a robot tartja, a titkot a vault őrzi.**
Ugyanez a válasz a ROS 2 DDS-re és a gRPC-streamekre is.

## Mielőtt építenél rá

- **A nem listázott nem privát.** Egy YouTube-linket bárki láthat, akinél ott van.
  Épületbelsőről, emberekről vagy belépési pontokról készült felvételhez általában
  saját tároló kell, `provider: url` és `sha256` mögött.
- **Egy playbook gépet mozgathat.** A manifest már most hordoz szabályokat a
  fizikai műveletekre, az emberi jóváhagyásra és a vészleállításra. Használd őket,
  és a biztonsági megjegyzéseket írd bele a skillbe, ahol minden olvasó látja.

## Ami ezután jön

Egy embodiment-profil a manifestben, hogy az export tudja, melyik skill melyik
robothoz illik. A kiadás engedélye külön az olvasásétól. És egy robot — vagy
szimulátor —, amely egy playbookból végez el egy valódi munkát, elejétől a végéig.

A részletek a dokumentációban: [Demonstrations](/docs/demonstrations) és
[Memória](/docs/memory).
