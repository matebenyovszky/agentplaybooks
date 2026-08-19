---
title: Un playbook, todos los agentes — adaptadores CLI, sincronización remota y el plugin de Claude Code
description: La CLI de AgentPlaybooks ahora sincroniza tus skills y configuración MCP entre Claude Code, Cursor, ChatGPT/Codex, Google Antigravity y Hermes Agent — y se distribuye como un plugin de Claude Code que instalas con un solo comando.
date: 2026-08-01
author: Mate Benyovszky
---

# Un playbook, todos los agentes

Tu configuración de agentes está dispersa. Los skills viven en
`.claude/skills/`, tus servidores MCP en `.mcp.json`, una copia ligeramente
distinta en `.cursor/mcp.json`, las instrucciones en `AGENTS.md` — y cada
nueva herramienta de codificación con IA añade otra carpeta. Mantener todo
eso consistente a mano es exactamente el tipo de tarea que los agentes
debían eliminar.

Desde hoy, la CLI de AgentPlaybooks cierra ese círculo. `agentplaybooks sync`
genera los archivos de plataforma que faltan en cada destino habilitado,
`pull`/`push` conectan tu proyecto local con un playbook alojado, y toda la
CLI es a la vez un **plugin de Claude Code** — así tu agente puede ejecutar
el flujo por ti.

## Cinco plataformas, un comando

`apb sync` normaliza lo que encuentra en el manifiesto canónico
`agentplaybook.json` y luego rellena los huecos por destino:

| Destino | Skills | Servidores MCP |
|---|---|---|
| Claude Code / Cowork | `.claude/skills/` | `.mcp.json` |
| Cursor | `.cursor/skills/` | `.cursor/mcp.json` |
| ChatGPT / OpenAI Codex | `.codex/skills/` | `.codex/config.toml` |
| Google Antigravity | `.agents/skills/` | — |
| Nous Hermes Agent | `~/.hermes/skills/` | — |

Escribe un skill una vez en Claude Code, ejecuta `apb sync --apply`, y
aparecerá también en Cursor, Codex y Antigravity — incluidas tus
definiciones de servidores MCP, traducidas automáticamente entre JSON y el
formato TOML de Codex.

Un buen detalle: Google Antigravity lee los skills del proyecto desde
`.agents/skills/`, exactamente el almacén portátil de AgentPlaybooks.
Descarga un playbook y estará listo para Antigravity sin pasos adicionales.

## Seguro por defecto

El motor de sincronización mantiene las garantías de nuestro diseño
original:

- **Primero el plan.** Nada se escribe ni se sube sin un `--apply`
  explícito.
- **Sin sobrescrituras silenciosas.** Las definiciones homónimas con
  contenido distinto son conflictos — se informan y se omiten hasta que
  resuelvas la divergencia.
- **Copias de seguridad.** Todo archivo modificado se copia antes a
  `.agentplaybooks/backups/`.
- **Sin fugas de secretos.** Los valores secretos nunca entran en el
  manifiesto, y `push` se niega a subir contenido que parezca contener
  credenciales incrustadas.

## Playbooks de equipo: pull y push

```bash
apb login                              # guarda tu user API key (apb_...)
apb push --apply                       # skills + servidores MCP + manifiesto → playbook alojado
apb pull <guid> --apply                # tus compañeros lo descargan en sus proyectos
apb sync --target=claude,codex --apply # …y lo llevan a las herramientas que usen
```

Los skills *y* las definiciones de servidores MCP viajan en ambas direcciones.
`pull` los deposita en el almacén portátil (`.agents/skills/`,
`.agents/mcp.json`); un `sync` posterior los reparte a cada plataforma que use
tu compañero — aunque sea un editor distinto al tuyo. Esa es la idea: **la
unidad portátil es el playbook, no la herramienta**.

Dos detalles que nos preguntaron de inmediato. El primero: el lado alojado sabe
cosas que un archivo local no puede expresar — timeouts de petición,
configuración de autenticación, listas curadas de herramientas. Un `push`
actualiza la conexión y deja todo eso en paz; nunca aplasta el registro más
rico con el más pobre. Y las entradas remotas que no existen en local quedan
intactas. El segundo: en una máquina recién estrenada el almacén portátil es lo
único que hay en disco y no es un destino de despliegue, así que `sync` te dice
qué herramientas de agente ha encontrado para tu usuario y qué pasarle a
`--target`. Nada de no-ops silenciosos.

## Secretos: viaja el contrato, no la credencial

Es la parte que la gente espera que sea vaga, así que seamos explícitos:
**ningún valor secreto se mueve nunca**. Lo que se mueve es el requisito.
`sync` recopila en el manifiesto todas las referencias de entorno de tu
configuración MCP:

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

Quien descargue el playbook sabe ya exactamente qué variables definir, y nadie
ha enviado una clave por ningún sitio. Si en su lugar apuntas una entrada a un
vault, tu edición sobrevive al siguiente sync. Las credenciales literales las
señala `doctor`, y `push` se niega a ejecutarse hasta que se reemplacen por
referencias — incluidas las credenciales que estén en una cabecera o en la URL
de un MCP.

## Instálalo como plugin de Claude Code

El paquete de la CLI es en sí mismo un plugin de Claude Code / Claude Cowork,
con el skill `agentplaybooks` y comandos slash:

```text
/plugin marketplace add matebenyovszky/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Después solo pide: «audita mi configuración de agentes», «haz que mis skills
de Claude estén disponibles en ChatGPT y Cursor», o ejecuta
`/agentplaybooks:doctor`. El skill conoce el flujo seguro — planifica,
muestra el diff y aplica solo tras tu aprobación.

## Empieza ya

```bash
git clone https://github.com/matebenyovszky/agentplaybooks
node agentplaybooks/packages/cli/bin/agentplaybooks.js doctor .
```

Lee la guía completa en la [documentación de CLI y plugins de editor](/docs/cli)
— y cuéntanos qué adaptador de plataforma quieres a continuación: ROS 2 ya
está en la [hoja de ruta](/docs/roadmap).
