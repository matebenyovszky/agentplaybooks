---
title: Playbookok biztonságos megosztása — közös szerkesztés API-kulcsok átadása nélkül
description: Az AgentPlaybooksban a tulajdonosok egyszer használható linkkel hívhatnak meg szerkesztőket, miközben a titkok, API-kulcsok, láthatóság és törlés tulajdonosi kézben marad.
date: 2026-07-21
author: Mate Benyovszky
---

# Oszd meg biztonságosan a playbookokat a csapatoddal

Egy jó playbook ritkán készül teljesen egyedül. A használható ügynök-beállításhoz szakterületi tudás, gondosan kialakított persona, skillek, eszközök, memória és munkadokumentumok kellenek — ezekhez pedig gyakran több ember tesz hozzá.

Az AgentPlaybooks mostantól támogatja a **humán szerkesztői együttműködést**. A tulajdonos meghívhat egy csapattagot, aki a saját fiókjával fogadja el a meghívást, majd a megosztott playbook közvetlenül megjelenik a dashboardján. Nincs közös jelszó, nincs ownership-átruházás, és egy agentnek szánt API-kulcsot sem kell emberi belépésként használni.

## Miért ne adjunk át egyszerűen egy Admin API-kulcsot?

Az API-kulcs kiváló gépi hitelesítő adat, de rossz emberi identitás. Egy bearer kulcs másolható, továbbküldhető, scriptbe építhető, és több ember is használhatja anélkül, hogy megbízhatóan megkülönböztethetnénk őket. Egyetlen ember hozzáférésének megszüntetése ilyenkor minden, ugyanazt a kulcsot használó integráció rotációját is jelentheti.

A szerkesztői meghívás más problémát old meg. A hozzáférés ahhoz a hitelesített fiókhoz kötődik, amely elfogadja a linket, a tulajdonos számára látható, és önállóan visszavonható. A playbook API-kulcsai továbbra is az agenteké és integrációké; a csapattagság emberi jogosultsági döntés marad.

## Szándékosan egyszerű szerepkörmodell

Az első kiadásban KISS-alapú modellt választottunk: minden playbooknak egy **Tulajdonosa** van, a közreműködők egyetlen szerepköre pedig a **Szerkesztő**.

A szerkesztők módosíthatják mindazt, amitől az agent hasznos lesz:

- név, leírás, konfiguráció és címkék;
- persona és rendszerutasítások;
- skillek és skill-mellékletek;
- MCP-szerver definíciók;
- canvas dokumentumok és memória.

A biztonsági határ felett kizárólag a tulajdonos rendelkezik:

- láthatóság és publikálás;
- meghívások és szerkesztők eltávolítása;
- playbook API-kulcsok;
- titkosított titkok;
- ownership és törlés.

Így nincs szükség átláthatatlan jogosultsági mátrixra, a szerkesztő mégsem tudja kibővíteni a saját hozzáférését vagy felfedni a hitelesítő adatokat.

## Így működik a meghívás

Nyisd meg a playbookot, válaszd a **Sharing** fület, és hozz létre egy szerkesztői linket. A link csak egyszer jelenik meg, **72 óra** után lejár, és egyetlen fiók fogadhatja el. Megbízható, privát csatornán küldd el.

A háttérben minden meghívás 256 bit kriptográfiai véletlent használ. Az AgentPlaybooks csak SHA-256 lenyomatot tárol, a nyers tokent nem. Az elfogadás atomi, ezért két egyidejű kérés sem használhatja fel sikeresen ugyanazt a linket. A tulajdonos bármikor visszavonhat egy függő meghívást vagy eltávolíthat egy aktív szerkesztőt.

Elfogadás után a playbook **Shared** jelöléssel jelenik meg a szerkesztő dashboardján. A tulajdonos mindvégig ugyanaz marad.

## Mire jó ez a gyakorlatban?

- Egy fejlesztő és egy szakterületi szakértő együtt tarthatja karban az agent utasításait.
- Egy kis csapat exportálás és újraimportálás nélkül fejlesztheti a skilleket és MCP-integrációkat.
- A szerkesztő frissen tarthatja a memóriát és a canvas dokumentumokat, miközben a tulajdonos védi a hitelesítő adatokat és publikálási beállításokat.
- A hozzáférés a production agentek API-kulcsainak megzavarása nélkül megszüntethető.

A kollaboráció már elérhető a dashboardon. Olvasd el a teljes [Team Collaboration útmutatót](/docs/team-collaboration), majd [nyisd meg a dashboardot](/dashboard), és hívd meg az első szerkesztődet.
