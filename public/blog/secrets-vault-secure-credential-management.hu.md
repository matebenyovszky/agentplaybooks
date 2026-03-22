---
title: Secrets Vault – Hitelesítőadat-kezelés kitettség nélkül AI-ügynökökhöz
description: Az AgentPlaybooks titkosított titkok tárolóját vezeti be egy egyedi proxy mintával, amellyel az AI ügynökök API-kulcsokat és hitelesítő adatokat használhatnak anélkül, hogy a nyílt szöveges értékeket valaha is látnák.
date: 2026-03-22
author: Mate Benyovszky
---

# Secrets Vault: Nulla kitettségű hitelesítőadat-kezelés

Örömmel mutatjuk be az AgentPlaybookshoz tartozó **Secrets Vault** funkciót: biztonságos módot ad arra, hogy az AI ügynökök valódi hitelesítő adatokkal hívjanak külső API-kat, miközben ezek az adatok soha nem kerülnek be a promptokba, naplókba vagy az ügynök számára látható eszközkimenetekbe. Olyan csapatoknak készült, akik automatizálni szeretnének anélkül, hogy feláldoznák a kulcsokkal kapcsolatos fegyelmet.

## 🔑 A probléma: Hitelesítő adatok az ügynöki ciklusban

Az ügynököknek **API-kulcsokra és tokenekre** van szükségük az LLM API-k, fizetési rendszerek, webhookok és más szolgáltatások eléréséhez. Amint egy titok bekerül a modell kontextusába, nő a kockázat: **naplók**, **átiratok**, **kontextus-dumpok** vagy **memória** kiszivárogtathatja. Azt szeretnéd, hogy az ügynökök *valódi* hitelesítő adatokkal *cselekedjenek* – ne pedig hogy *lássák* azokat.

## 🛡️ A megoldásunk: Nulla kitettségű proxy minta

A Secrets Vault ezt egy **`use_secret`** eszközre épülő **proxy mintával** oldja meg.

Az ügynök soha nem olvassa be a titkot. Arra kéri a szervert, hogy **használjon** egy elnevezett titkot – például: *„Használd az `OPENAI_API_KEY` kulcsomat ehhez az URL-hez intézett híváshoz.”* A szerver a megbízható határon belül visszafejt, beilleszti a fejlécet (pl. `Authorization: Bearer …`), és **csak a HTTP választ** adja vissza. A nyílt szöveg nem jut el a modellhez.

## ⚙️ Hogyan működik (technikai részletek)

Védelem mélységben: **AES-256-GCM** titkosítás titkosításonként véletlen IV-kkel; **HKDF-ből származtatott, felhasználónkénti kulcsok**, így a titkosított adat identitás szerint elkülönül; **nyílt szöveg nincs tárolva**. A **`use_secret`** útvonal: ügynök → visszafejtés szerveroldalon → fejléc beillesztése → kimenő HTTP → **csak a válasz** vissza. **SSRF szabályok** blokkolják a privát/belső célokat. **Row Level Security (RLS)** korlátozza a sorokat, így a playbook tulajdonosai csak a saját titkaikat látják – az adatbázisban érvényesül, nem csak az alkalmazáskódban.

## Elérhető MCP eszközök

| Eszköz | Mit csinál |
|--------|------------|
| `list_secrets` | Csak a titkok **neveit és metaadatait** listázza – soha az értékeket. |
| `use_secret` | HTTP kérést végez szerveroldalon befecskendezett titokkal; a távoli választ adja vissza. |
| `store_secret` | Titkosít és eltárol egy új titkot. |
| `rotate_secret` | Egy meglévő titkot új értékre cserél. |
| `delete_secret` | Véglegesen töröl egy titkot. |

A hatókörre szabott jogosultságok (`secrets:read` / `secrets:write`) a legkisebb szükséges jogosultság elvét tartják az integrációknál.

## Példa: API hívás a `use_secret` segítségével

Példa MCP `tools/call` payload (a pontos forma kliensenként változhat):

```json
{
  "name": "use_secret",
  "arguments": {
    "secret_name": "OPENAI_API_KEY",
    "url": "https://api.openai.com/v1/models",
    "method": "GET",
    "header_name": "Authorization",
    "header_prefix": "Bearer "
  }
}
```

A modell a felsőbb réteg JSON-ját vagy hibáját látja – **soha** a tokent. Ugyanez a minta bármely, fejléc-alapú HTTPS API esetén, amelyet név szerint tároltál.

## Kezelés a vezérlőpultról

A vezérlőpulton a **Titkok** szekció **létrehozást**, **csak metaadatokon alapuló megtekintést**, **rotációt** és **törlést** támogat, **kategóriákkal** és **lejárat** követéssel – mentés után a nyers értékeket nem mutatja.

## Első lépések

1. Adj meg elnevezett titkokat a vezérlőpulton (`OPENAI_API_KEY`, `STRIPE_SECRET_KEY` stb.).
2. Mutasd az MCP kliensedet a playbook végpont felé, és ellenőrizd, hogy megjelennek a titkokhoz kapcsolódó eszközök.
3. Használd a **`use_secret`**-et kimenő, hitelesített hívásokhoz – soha ne jeleníts meg titok értékeket a csevegésben.

---

[Nyiss meg egy Playbookot](/dashboard), tárold el a titkokat egyszer, és engedd, hogy az ügynökök külső API-kkal integráljanak – anélkül, hogy a kulcsok valaha is bekerülnének a modellbe.
