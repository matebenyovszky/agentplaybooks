# AgentPlaybooks Tools a Hermeshez

![AgentPlaybooks Tools a Hermeshez](/plugin-catalog/hermes-tools.png)

Az **AgentPlaybooks Tools** plugin segít, hogy a Hermes használni tudja a
playbookok skilljeit és eszközeit. Végigvezet a hosztolt MCP-eszközök – köztük
a föderált MCP- és OpenAPI-szolgáltatások – csatlakoztatásán, a hitelesítés
beállításán és a privát skillek kiválasztott Hermes-profilba szinkronizálásán.
A különálló [AgentPlaybooks Memory](./hermes-memory.md) plugint egészíti ki.

A plugin egy skillt telepít, nem háttérszolgáltatást. A külön telepített `apb`
CLI-vel készít előnézetet és alkalmaz ellenőrzött módosításokat a kiválasztott
Hermes-profilban. A hozzáférési adatokat a profil titoktárolójában vagy az
AgentPlaybooks vaultban kell megadni; a plugin soha nem kéri, hogy chatben
küldd el a titkot.

## Telepítés

A Hermes-katalógus csomagneve `agentplaybooks-tools`:

```bash
hermes plugins install agentplaybooks-tools --no-enable
hermes plugins enable agentplaybooks-tools
npm install -g @agentplaybooks/cli@0.7.0
apb --version
```

A CLI-hez Node.js 20 vagy újabb kell. Távoli Hermes gateway esetén a Node.js-nek
és az `apb` parancsnak is a gateway gépen vagy konténerben kell elérhetőnek
lennie. A távoli profilba telepített skill nem telepíti a CLI-t sem a Macedre,
sem a gatewayre.

## Közös beállítás (CLI 0.7.0)

A gateway gépén vagy konténerében, a projekt könyvtárában futtasd:

```bash
apb login
apb hermes setup <playbook-guid> . --profile=work
apb hermes setup <playbook-guid> . --profile=work --apply
apb hermes doctor <playbook-guid> . --profile=work --check
```

A `--profile=work` a telepítés `profiles/work` profilját választja ki;
a telepítés helyét `--hermes-home=/útvonal` adja meg. Ugyanezt a kiválasztást
használja a `connect`, a `sync` és a `memory setup` is.

Az előnézet ellenőrzi a Node.js-t, a Hermest, az írási jogokat és a kulcs
jelenlétét, majd felsorolja a visszaállítandó playbookfájlokat és a módosítandó
profilkonfigurációt. A visszaállítás teljes skillkönyvtárakat és a hozzájuk tartozó fájlokat tölt le.
A hosztolt MCP/OpenAPI-definíciókat a playbook MCP-végpontja kezeli. Ütközés esetén nem alkalmazza a
tervet. A hosztolt eszközök egy playbook-MCP-kapcsolaton érhetők el.

A kapcsolat alapértelmezett kulcsváltozója `APBKS_KEY_AGENTPLAYBOOKS`: ide
playbookhoz kötött kulcs kell a profil titokkörnyezetében. Az `apb login`
külön, felhasználói kulccsal hitelesíti a fájlletöltést. A `--tools-only`
elhagyja a fájlvisszaállítást és a felhasználói bejelentkezést. Kulcsérték nem
kerül a konfigurációba; a külső szolgáltatások titkai a vaultban maradnak.

Az `--apply` MCP-kapcsolatot nyit és eszközlistát kér, eszközt nem hív meg.
Hiányzó vagy elutasított kulcsnál 2-es kilépési kódot adhat akkor is, ha a
fájlok már települtek. Állítsd be a kulcsot, indítsd újra a gatewayt, és annak
környezetéből futtasd a `doctor --check` parancsot. A profil `.env` fájljában
bejelentett változó és a futó folyamatban elérhető kulcs külön állapot.
A `doctor` `--check` nélkül nem végez hálózati kérést.

## Playbook-eszközök csatlakoztatása

Hitelesítsd a CLI-t, majd nézd át a playbookhoz kötött csatlakoztatási tervet:

```bash
apb login
apb connect <playbook-guid> --target=hermes
```

A terv megmutatja a szükséges, playbookhoz kötött API-kulcs környezeti
változójának nevét. Add hozzá ezt a titkot a kiválasztott Hermes-profilhoz,
majd alkalmazd a csatlakoztatást:

```bash
apb connect <playbook-guid> --target=hermes --apply
```

A kapcsolat elérhetővé teszi a playbook hosztolt MCP-eszközeit, köztük a
beállított föderált MCP- és OpenAPI-szolgáltatásokat. A külső szolgáltatások
kulcsai az AgentPlaybooks vaultban maradnak; a Hermes konfigurációjába nem
másolódnak át.

## Privát skillek hozzáadása

Töltsd le az átnézett skillfájlokat a projektbe, majd szinkronizáld őket a
Hermesbe:

```bash
apb pull <playbook-guid> .
apb pull <playbook-guid> . --apply
apb sync . --target=hermes
apb sync . --target=hermes --apply
```

Az `--apply` nélküli parancsok előnézetet készítenek. Alkalmazás előtt nézd át
a tervet. Nyilvános skillek közvetlenül a playbook
`/.well-known/skills/` címéről is telepíthetők.

Részletekért lásd a [CLI-útmutatót](./cli.md) és a
[Hermes Memory útmutatót](./hermes-memory.md).
