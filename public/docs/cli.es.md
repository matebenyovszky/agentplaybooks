# CLI y plugins de editor

La CLI de AgentPlaybooks (`@agentplaybooks/cli`, binario `agentplaybooks` o
`apb`) mantiene tu configuración de agentes — archivos de instrucciones,
Agent Skills y definiciones de servidores MCP — sana, consistente entre
herramientas de codificación con IA y compartible como playbook alojado. Es
un paquete Node.js (>= 20) sin dependencias, ubicado en
[`packages/cli`](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/cli).

## Doctor: audita tu configuración de agentes

```bash
apb doctor .            # informe de salud legible
apb doctor . --json     # salida estable procesable por máquinas
apb doctor . --strict   # código de salida 2 con hallazgos high/critical (CI)
```

Doctor es de solo lectura y solo local. Descubre archivos `AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, `SKILL.md` y configuraciones MCP en las carpetas
de plataforma, e informa:

- Violaciones de la especificación de Agent Skills (name/description ausentes)
- Credenciales probablemente incrustadas (nunca imprime valores, solo líneas)
- URLs MCP `http://` inseguras fuera de localhost
- Skills o servidores MCP homónimos con definiciones divergentes (drift)
- Una puntuación de salud determinista de 0 a 100

## Sync: un playbook, todos los agentes

```bash
apb sync .                       # solo plan — muestra lo que se escribiría
apb sync . --apply               # escribe el manifiesto y los archivos faltantes
apb sync . --target=codex        # habilita además un destino que el proyecto no tiene
```

Sync normaliza lo encontrado en el manifiesto canónico `agentplaybook.json`
y luego genera los archivos que faltan en cada destino de despliegue
habilitado:

| Destino | Skills | Servidores MCP | Instrucciones |
|---|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<nombre>/SKILL.md` | `.mcp.json` | `CLAUDE.md` que importa `AGENTS.md` |
| `cursor` — Cursor | `.cursor/skills/<nombre>/SKILL.md` | `.cursor/mcp.json` | — |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<nombre>/SKILL.md` | `.codex/config.toml` | lee `AGENTS.md` de forma nativa |
| `antigravity` — Google Antigravity | `.agents/skills/<nombre>/SKILL.md` | — (config. global) | — |
| `grok` — Grok Bot (xAI) | `.agents/skills/<nombre>/SKILL.md` | — (MCP Box de la cuenta; se informa) | lee `AGENTS.md` de forma nativa |
| `hermes` — Hermes Agent (Nous Research) | `.agents/skills/<nombre>/SKILL.md`, registrado en `~/.hermes/config.yaml` | `mcp_servers:` en `~/.hermes/config.yaml` | lee `AGENTS.md` de forma nativa; persona → `~/.hermes/SOUL.md` |

Las plataformas detectadas se habilitan automáticamente; `antigravity` y
`hermes` son opcionales — añade una entrada a `spec.targets` en
`agentplaybook.json`:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

Reglas de seguridad:

- Todo es solo un plan salvo que pases `--apply` explícitamente.
- Las definiciones homónimas con contenido distinto son **conflictos**: se
  informan y se omiten, nunca se sobrescriben. Resuelve la divergencia y
  vuelve a ejecutar.
- Los archivos modificados se respaldan antes en `.agentplaybooks/backups/`.
- Los valores secretos nunca entran en el manifiesto — solo referencias de
  entorno.
- Los finales de línea se normalizan (CRLF se trata como LF), así el mismo
  skill tiene el mismo digest en Windows, macOS y Linux. Un equipo con
  plataformas mixtas nunca ve divergencias fantasma por el checkout.

## Sincronización remota: comparte playbooks con tu equipo

```bash
export AGENTPLAYBOOKS_API_KEY=<tu-user-api-key>
apb login               # verifica y guarda la clave (~/.agentplaybooks, 0600)
apb playbooks           # lista los playbooks accesibles

apb pull <guid> --apply # descarga skills a .agents/skills/
apb push --apply        # sube skills locales + manifiesto
```

Las instrucciones, los skills, los servidores MCP y el manifiesto viajan en
ambas direcciones:

- **Local → alojado** (`push`): el archivo de instrucciones del proyecto, los
  skills y las definiciones de servidores MCP
  encontrados en cualquier carpeta de plataforma, más el manifiesto canónico,
  se suben al playbook vinculado (o a uno nuevo). `AGENTS.md` manda cuando hay
  varios archivos de instrucciones en la raíz del proyecto; si esos archivos de
  la raíz se contradicen entre sí, es un conflicto, y los archivos de
  instrucciones anidados se quedan en local porque su alcance es un
  subdirectorio, no el proyecto. Los archivos locales tienen
  la autoridad sobre la conexión en sí (command, args, env, url, headers); los
  ajustes de federación que solo existen en el lado alojado — timeouts,
  autenticación, acceso, listas curadas de herramientas, descripciones — se
  preservan, no se sobrescriben. Las entradas remotas que ya no existen en
  local quedan intactas.
- **Alojado → local** (`pull` + `sync --apply`): las instrucciones del playbook
  llegan a `AGENTS.md`, los skills remotos a
  `.agents/skills/` y los servidores MCP remotos a `.agents/mcp.json` — el
  almacén portátil — y el proyecto se vincula mediante
  `.agentplaybooks/remote.json`. El sync posterior reparte ambos a todos los
  destinos de plataforma habilitados, sea cual sea el editor de tu compañero.

Claude Code lee `CLAUDE.md` y no lee `AGENTS.md`, pero sí admite importaciones
con `@`. Así que el destino `claude` no copia tus instrucciones: escribe un
`CLAUDE.md` que contiene `@AGENTS.md`. Una única fuente de verdad, nada que
pueda divergir. Si ya tienes un `CLAUDE.md` sin esa importación, `sync` te lo
informa en lugar de reescribir tu archivo.

En una máquina recién estrenada el almacén portátil es lo único que hay en
disco, y no es un destino de despliegue — así que no se escribiría nada.
Habilita las herramientas que tengas:

```bash
apb pull <guid> --apply
apb sync --target=claude,codex --apply
```

`sync` también lista las herramientas de agente que detecta para tu usuario
cuando no hay ningún destino habilitado, así sabes qué pasarle.

Los servidores de federación OpenAPI son una capacidad exclusiva del lado
alojado, sin equivalente en los clientes locales; `pull` los informa en lugar
de escribir una configuración a medio traducir. Los valores secretos no se
mueven en ninguna dirección — ver más abajo. Para despliegues self-hosted usa
`--url=<base>` o `AGENTPLAYBOOKS_URL`.

## Secretos: ningún valor en texto plano toca nunca el disco

```bash
apb secrets login <guid>     # una clave limitada a un playbook, guardada con 0600
apb secrets status           # qué hace falta vs. qué hay en el vault vs. en esta shell
pass show deploy/api | apb secrets push DEPLOY_API_KEY
apb secrets run -- npm run deploy
```

- **`status`** solo imprime nombres y estado: lo que el playbook necesita, lo que
  hay en el vault, lo que el propietario marcó como revelable, lo que ya tienes
  definido en tu shell. Nunca un valor.
- **`push`** toma el valor de la entrada estándar o de `--from-env=<VAR>` — nunca
  de un argumento de línea de comandos, porque argv acaba en el historial de la
  shell y en la lista de procesos. Muestra el nombre, el playbook de destino y el
  número de caracteres, y luego te exige escribir `yes`. Un secreto existente se
  rota en su sitio, dejando intactos el indicador de revelado del propietario, la
  lista de hosts permitidos, la categoría y la caducidad.
- **`run`** trae los secretos declarados a memoria, los inyecta en un único
  proceso hijo y termina. No se escribe nada en ninguna parte. Los secretos que
  el propietario no haya marcado como revelables se quedan en el vault y se
  informan como omitidos.
- Estos comandos usan una clave de API **limitada a un playbook** en lugar de tu
  clave de cuenta, así que la credencial capaz de llegar a los secretos queda
  restringida a un único playbook. Usa `AGENTPLAYBOOKS_PLAYBOOK_KEY` para no
  guardarla en absoluto.

Si tu agente habla con el playbook alojado como servidor MCP, no necesitas nada
de esto: la herramienta `use_secret` hace que la plataforma inyecte la credencial
en el lado del servidor, así que el valor tampoco entra en el contexto del
agente.

## El playbook lleva el contrato, no la credencial

Un playbook declara qué credenciales necesita; los valores se quedan donde
corresponde. `sync` recopila en `spec.secrets` todas las referencias de
entorno que encuentra en tu configuración MCP (`${VAR}`, `$VAR`, `env:VAR`):

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

Eso hace que el playbook sea portátil y autodescriptivo: quien lo descargue
sabe exactamente qué variables definir, sin que nadie transmita nunca una
clave. Si editas una entrada — apuntándola a un vault o marcándola como
opcional — tu versión se preserva en el siguiente sync. Los valores de
credenciales literales nunca se escriben en el manifiesto ni se suben;
`doctor` los señala y `push` se niega a ejecutarse hasta que se reemplacen por
referencias.

## Plugin para Claude Code y Claude Cowork

El paquete de la CLI es a la vez un plugin de Claude Code con el skill
`agentplaybooks` y los comandos `/agentplaybooks:doctor`, `:sync`, `:pull`,
`:push`:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Tras instalarlo, pídele a Claude cosas como «audita mi configuración de
agentes» o «haz que mis skills de Claude estén disponibles en Cursor y
ChatGPT» — el skill conoce el flujo seguro (primero plan, apply tras tu
aprobación).

## Otras plataformas

- **ChatGPT / Codex**: los skills van a `.codex/skills/` y los servidores MCP
  a `.codex/config.toml` — la CLI de Codex y el agente de codificación de
  ChatGPT los detectan automáticamente.
- **Google Antigravity**: lee los skills del proyecto desde `.agents/skills/`,
  exactamente el almacén portátil de AgentPlaybooks — un playbook descargado
  queda listo para Antigravity sin pasos extra.
- **Grok Bot (xAI)**: descubre los skills desde un conjunto fijo de raíces que
  ya incluye el almacén portátil `.agents/skills/` (junto a `.claude/skills/`,
  `.codex/skills/` y `.cursor/skills/`), y su system prompt carga `AGENTS.md`
  directamente — así que un proyecto sincronizado queda listo para Grok sin
  archivo puente. La **excepción son los servidores MCP**: Grok Bot solo guarda
  un array de *ids* de servidor en `~/.grokbot/settings.json` (`mcpBoxServers`)
  y las definiciones viven en la MCP Box de la cuenta, por lo que ningún archivo
  de proyecto puede aprovisionarlos. Por eso `sync` informa de los servidores
  que no pudo entregar en lugar de descartarlos en silencio. La salida es una
  sola entrada: añade una vez el propio endpoint MCP del playbook
  (`POST /api/mcp/<guid>`) a la Box y sus skills, memoria, canvas y `use_secret`
  llegarán a cada sesión de Grok Bot.
- **Hermes Agent**: un perfil guarda todo en `~/.hermes` (o `$HERMES_HOME`). En
  lugar de copiar los skills a ese perfil, sync registra el almacén portátil en
  `skills.external_dirs` dentro de `~/.hermes/config.yaml` — Hermes los lee donde
  ya están: sin duplicados, y el siguiente `pull` surte efecto sin otro sync. Si
  coinciden los nombres, ganan los skills propios de Hermes en
  `~/.hermes/skills/`. Los servidores MCP se fusionan en ese mismo `config.yaml`
  (se conservan los comentarios y los ajustes ajenos), y una persona descargada
  pasa a ser `~/.hermes/SOUL.md` — nunca se sobrescribe una existente, porque
  Hermes crea una por defecto en el primer arranque. Las instrucciones se leen de
  `AGENTS.md` de forma nativa, pero Hermes solo carga el *primer* archivo de
  contexto que encuentra (`.hermes.md` → `AGENTS.md` → `CLAUDE.md` →
  `.cursorrules`), así que un `.hermes.md` que oculte `AGENTS.md` se reporta como
  conflicto. Los skills de un playbook público también se instalan directamente
  desde la web:
  `hermes skills install well-known:https://agentplaybooks.ai/playbooks/<guid>/.well-known/skills/<nombre>`.
- **Cursor**: skills en `.cursor/skills/`, servidores MCP en
  `.cursor/mcp.json`.
