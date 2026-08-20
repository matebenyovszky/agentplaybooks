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

A `client_secret` itt is **titoknév**, nem érték: magát az értéket a playbook **Secrets** fülén tárold ugyanezen a néven.

Bearer hitelesítésnél `token_secret`, API-kulcsnál `header`, `prefix` és `api_key_secret` használható.

### Hogyan oldódnak fel a titoknevek

A `token_secret`, `api_key_secret` vagy `client_secret` mezőben megadott név **hivatkozás**, nem érték. Híváskor pontos névegyezéssel a playbook Secrets vaultjából oldódik fel — ugyanabból a tárolóból, amit a `use_secret` eszköz és a Secrets fül is használ. Máshol nem keresi: szerverenkénti tároló egykor létezett, de megszüntettük, mert a legértékesebb hitelesítő adatokat a vaultnál gyengébb titkosítás alatt tartotta, rotáció, lejárat és audit nélkül.

Egy hitelesítő adatnak így elég egyszer léteznie. Vedd fel a `SEARCH_TOKEN`-t a Secrets fülön, állítsd be a `"auth": {"type": "bearer", "token_secret": "SEARCH_TOKEN"}` konfigurációt akárhány szerveren, és mindegyik a vaultból oldja fel — a szerverszerkesztő automatikusan kiegészíti a vaultbeli neveket, és megmutatja, honnan fog jönni minden hivatkozott név.

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

A hitelesítő adatot a playbook **Secrets** fülén tárold, majd névvel hivatkozz rá a szerver transport configjából (`auth.token_secret`, `auth.api_key_secret`, `auth.client_secret`). Nincs külön MCP-titok tároló és nincs külön titkosítási kulcs: a széf tartja, AES-256-GCM-mel, tulajdonosonként származtatott kulccsal, és a plaintextet soha nem adja vissza. A titkon beállított `allowed_hosts` lista minden célhelyre érvényesül, amit a szerver configja elérhet.

Az `access: "public"` upstream költséget tehet nyilvánosan elérhetővé. Javasolt a `playbook_api_key`; ehhez a kliensnek `tools:call` vagy `full` jogosultságú playbookkulcs kell.

A tulajdonos a metaadat-alapú hívástörténetet a `GET /api/playbooks/PLAYBOOK_GUID/audit?limit=100` (a korábbi `GET /api/mcp/audit/PLAYBOOK_GUID` továbbra is ugyanezt válaszolja) végponton olvashatja munkamenettel vagy `playbooks:read` jogosultságú felhasználói API-kulccsal.
