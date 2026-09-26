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
npm install -g @agentplaybooks/cli@0.5.0
apb --version
```

A CLI-hez Node.js 20 vagy újabb kell. Távoli Hermes gateway esetén a Node.js-nek
és az `apb` parancsnak is a gateway gépen vagy konténerben kell elérhetőnek
lennie. A távoli profilba telepített skill nem telepíti a CLI-t sem a Macedre,
sem a gatewayre.

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
