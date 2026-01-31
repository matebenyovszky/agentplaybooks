---
title: Bemutatjuk az RLM-alapú Memóriát - Hierarchikus Kontextus AI Ágenseknek
description: Az AgentPlaybooks most már támogatja a Recursive Language Model elveket hierarchikus memória szintekkel, kontextus tömörítéssel és intelligens archiválással.
date: 2026-01-31
author: Benyovszky Máté
---

# Bemutatjuk az RLM-alapú Memóriát

Örömmel jelentjük be az AgentPlaybooks memória rendszerének jelentős frissítését, amelyet a **Recursive Language Model (RLM)** kutatások inspiráltak. AI ágenseid mostantól aktívan kezelhetik kontextusukat hierarchikus memória szervezéssel.

## A Kontextus Ablak Kihívása

Minden AI modellnek véges kontextus ablaka van. Ahogy a beszélgetések nőnek és a feladatok halmozódnak, az ágensek elveszítik a hozzáférést a korábbi információkhoz—ezt nevezzük **kontextus romlásnak**. A hagyományos megközelítések vagy levágjak az előzményeket, vagy naiv visszakeresésre támaszkodnak, gyakran elveszítve kritikus árnyalatokat.

## Megoldásunk: Intelligens Memória Szintek

Az új memória rendszer három szintet vezet be, amelyek tükrözik, hogyan kezelik az információt a hatékony csapatok:

### 🔥 Munkamemória (Working)
Aktív feladat kontextus. Mindig teljes egészében betöltve a promptokba. Tekints rá úgy, mint az ágensed "piszkozat füzetére" az aktuális feladathoz.

### 📋 Kontextuális Memória (Contextual)
Friss döntések és háttér kontextus. Az ágens **összefoglalókat** lát a kontextus nézetében, a teljes részletek igény szerint elérhetők.

### 📚 Hosszútávú Memória (Long-term)
Archivált tudás és befejezett munka. Indexelt és kereshető, de nem töltődik be automatikusan. Mindent megőriz anélkül, hogy felduzzasztaná az aktív kontextust.

## Új Ágens Képességek

Ágenseid erőteljes új MCP eszközökhöz férnek hozzá:

| Eszköz | Mit Csinál |
|--------|------------|
| `consolidate_memories` | Kapcsolódó memóriák összevonása egyetlen összefoglalóba |
| `promote_memory` | Fontos információ előléptetése munkamemóriába |
| `get_memory_context` | Token-optimalizált nézet minden szintről |
| `archive_memories` | Befejezett munka áthelyezése hosszútávú tárolóba |
| `get_memory_tree` | Szülő-gyermek memória kapcsolatok vizualizálása |

## Példa: Okos Kontextus Kezelés

```
Ágens: "Befejeztem a felhasználói kutatási fázist. Hadd vonjam össze ezeket az eredményeket."

→ Meghívja a consolidate_memories-t:
  - Összevon 15 egyéni interjú jegyzetet
  - Létrehozza a szülőt: "felhasznaloi_kutatas_osszefoglalas"
  - Archiválja a részleteket, megtartja az összefoglalót aktívan
  
Eredmény: Kontextus 80%-kal csökkent, kulcs meglátások megőrizve
```

## Mit Tesz Ez Lehetővé

1. **Hosszabb Munkamenetek**: Az ágensek összetett, többfázisú projekteken dolgozhatnak anélkül, hogy elveszítenék a korai kontextust.

2. **Hatékony Token Használat**: Csak a releváns információ foglalja el a kontextus ablakot.

3. **Tudás Felhalmozás**: A befejezett munka nem vész el—rendszerezve és visszakereshető.

4. **Csapat Tudásbázis**: A megosztott playbookok idővel intézményi memóriát építenek.

## Kezdés

Az új memória funkciók automatikusan működnek a meglévő playbookokban. A teljes kihasználáshoz:

1. **Használj szinteket explicit módon**: Memóriák írásakor add meg a `tier: "working"` opciót aktív feladatokhoz.

2. **Adj hozzá összefoglalókat**: Használj `summary` mezőket a gyors kontextus betöltéshez.

3. **Konszolidálj rendszeresen**: Fázisok befejezése után vond össze a kapcsolódó memóriákat.

## Mi Következik

Folytatjuk a memória rendszer fejlesztését:

- **Vizuális Memória Szerkesztő**: Fa nézet és konszolidációs varázsló a felületen
- **Automatikus Archiválás**: Háttérfolyamatok az intelligens szint kezeléshez
- **Szemantikus Keresés**: Vektor beágyazások természetes nyelvű memória lekérdezésekhez

---

Az RLM-alapú memória rendszer mostantól elérhető minden AgentPlaybooks felhasználó számára. [Hozz létre egy Playbookot](/dashboard) és add meg ágenseidnek a kontextus kezelést, amit megérdemelnek.
