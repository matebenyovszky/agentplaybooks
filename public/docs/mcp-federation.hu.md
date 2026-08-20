# Federált MCP- és OpenAPI-eszközök

Az AgentPlaybooks a külső MCP- vagy OpenAPI-kapcsolatot magában a playbookban tárolja, majd a playbook egyetlen élő MCP-végpontján keresztül teszi elérhetővé:

```text
https://agentplaybooks.ai/api/mcp/PLAYBOOK_GUID
```

A végpont élőben felderíti az upstream eszközöket, `ext__SERVER_ID__TOOL` névtérbe helyezi őket, és a hívást a megfelelő szerverhez proxyzza. Az MCP-erőforrások visszafejthető `mcp-proxy://` URI-t kapnak.

## Támogatott kapcsolatok

- MCP Streamable HTTP JSON- vagy SSE-válasszal
- Beágyazott vagy `spec_url` címről betöltött OpenAPI 3.x leírás
- Bearer token, API-kulcs és OAuth 2.0 client credentials
- 100 ms és 60 másodperc közötti timeout
- Opcionális playbook API-kulcsos hozzáférés
- AES-GCM-mel titkosított secret-tárolás
- Auditlog művelettel, céllal, státusszal, késleltetéssel, hibakóddal és request ID-val

A privát, loopback, link-local, `.local` és `.internal` célok tiltottak. Alapértelmezetten csak HTTPS engedélyezett.

## MCP-konfiguráció OAuth-val

Az **MCP Servers → Connection** részen:

```json
{
  "url": "https://research.example.com/mcp",
  "timeout_ms": 15000,
  "access": "playbook_api_key",
  "auth": {
    "type": "oauth2_client_credentials",
    "token_url": "https://research.example.com/oauth/token",
    "client_id": "agentplaybooks",
    "client_secret": "client_secret",
    "scopes": ["tools:read", "tools:call"]
  }
}
```

Az **Encrypted secrets** mezőbe külön kerüljön:

```json
{ "client_secret": "titkos-ertek" }
```

Bearer hitelesítésnél `token_secret`, API-kulcsnál `header`, `prefix` és `api_key_secret` használható.

### Hogyan oldódnak fel a titoknevek

A `token_secret`, `api_key_secret` vagy `client_secret` mezőben megadott név **hivatkozás**, amely híváskor két lépésben oldódik fel:

1. **A szerver saját Encrypted secrets tárolója** — ha a név itt van definiálva, ez az érték nyer.
2. **A playbook Secrets vaultja** — ugyanaz a tároló, amit a `use_secret` eszköz és a Secrets fül is használ, pontos névegyezés alapján.

Egy hitelesítő adatnak így elég egyszer léteznie. Vedd fel a `SEARCH_TOKEN`-t a Secrets fülön, állítsd be a `"auth": {"type": "bearer", "token_secret": "SEARCH_TOKEN"}` konfigurációt akárhány szerveren, és mindegyik a vaultból oldja fel — a szerverszerkesztő automatikusan kiegészíti a vaultbeli neveket, és megmutatja, honnan fog jönni minden hivatkozott név. A szerverenkénti tároló továbbra is hasznos felülbírálásként, vagy olyan hitelesítő adathoz, amelyet más szerverek név szerint sose érhessenek el.

A vaultból való feloldás proxy-jellegű használat: a visszafejtett érték szerveroldalon kerül a kimenő kérésbe, és soha nem jut vissza a hívóhoz, így a titok reveal jelzőjétől függetlenül működik — pontosan úgy, mint a `use_secret`. Ha a vaultbeli titok `allowed_hosts` listát deklarál, az a szerver transport-konfigurációjának minden célcímére érvényesül (`url`, `spec_url`, `base_url`); a máshová rögzített titok feloldatlan marad, és a hívás a nevét megnevező `MISSING_SECRET` hibával bukik el, ahelyett hogy a hitelesítő adat olyan helyre menne, amelyet a tulajdonosa kizárt.

## OpenAPI-konfiguráció

```json
{
  "spec_url": "https://api.example.com/openapi.json",
  "base_url": "https://api.example.com/v1/",
  "timeout_ms": 10000,
  "access": "playbook_api_key",
  "auth": { "type": "api_key", "header": "X-API-Key", "api_key_secret": "api_key" }
}
```

Minden OpenAPI `operationId` namespacelt MCP-eszközzé válik. A path/query/header paraméterek a tool argumentumaiból, a JSON request body a `body` argumentumból készül.

## Hívási szemantika

A `tools/list` a beépített playbookműveleteket és a federált eszközöket listázza. A skillek utasítások: a `list_skills` és `get_skill` művelettel olvashatók, nem jelennek meg hamis végrehajtható toolként. Ugyanezek az eszközök a generált OpenAPI export `POST /api/mcp/PLAYBOOK_GUID/tools/TOOL_NAME` útvonalán is hívhatók.

## Telepítés és biztonság

Állíts be legalább 32 karakteres, véletlen `MCP_SECRET_ENCRYPTION_KEY` értéket – legjobb egy 64 karakteres hexadecimális sztring, mert az érték nyers kulcsanyagként kerül felhasználásra, nem hasheljük –, és futtasd a `supabase/migrations/20260730_federated_mcp_proxy.sql` migrációt. A secret plaintext csak íráskor érkezik be, AES-256-GCM-mel titkosítva tárolódik, és az API soha nem adja vissza.

Az egyes szerverek hitelesítő adatait ebből az értékből HKDF-fel származtatott kulccsal titkosítjuk, amelyet a szerver azonosítója sóz meg, és az azonosító a titkosított adat hitelesített része. Így az egyik szerver kulcsanyagával nem lehet egy másik szerver adatát visszafejteni, egy másik szerver sorába átmásolt titkosított érték pedig egyáltalán nem fejthető vissza. A változás előtt írt sorok (nincs `v2:` prefixük) továbbra is olvashatók, és automatikusan frissülnek, amikor az adott szerver secretjeit legközelebb mented.

Az `access: "public"` upstream költséget tehet nyilvánosan elérhetővé. Javasolt a `playbook_api_key`; ehhez a kliensnek `tools:call` vagy `full` jogosultságú playbookkulcs kell.

A tulajdonos a metaadat-alapú hívástörténetet a `GET /api/playbooks/PLAYBOOK_GUID/audit?limit=100` (a korábbi `GET /api/mcp/audit/PLAYBOOK_GUID` továbbra is ugyanezt válaszolja) végponton olvashatja munkamenettel vagy `playbooks:read` jogosultságú felhasználói API-kulccsal.
