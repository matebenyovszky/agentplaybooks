---
title: Secrets Vault — Gestión de credenciales sin exposición para agentes de IA
description: AgentPlaybooks presenta un almacén de secretos cifrado con un patrón proxy único que permite a los agentes de IA usar claves API y credenciales sin ver nunca los valores en texto plano.
date: 2026-03-22
author: Mate Benyovszky
---

# Secrets Vault: gestión de credenciales sin exposición

Nos complace presentar **Secrets Vault** para AgentPlaybooks: una forma segura de que los agentes de IA llamen a APIs externas con credenciales reales, sin que esas credenciales aparezcan nunca en prompts, registros ni en la salida de herramientas visible para el agente. Está pensado para equipos que quieren automatización sin renunciar a una buena higiene de claves.

## 🔑 El problema: credenciales en el bucle del agente

Los agentes necesitan **claves API y tokens** para acceder a APIs de LLM, sistemas de pago, webhooks y más. Cada vez que un secreto entra en el contexto del modelo, aumenta el riesgo: **registros**, **transcripciones**, **volcados de contexto** o **memoria** pueden exponerlo. Quieres que los agentes **actúen** con credenciales reales, no que las **vean**.

## 🛡️ Nuestra solución: el patrón proxy sin exposición

Secrets Vault lo resuelve con un **patrón proxy** construido en torno a la herramienta `use_secret`.

El agente nunca lee el secreto. Pide al servidor que **use** un secreto con nombre —por ejemplo: *«Usa mi `OPENAI_API_KEY` para llamar a esta URL».* El servidor descifra dentro del límite de confianza, inyecta la cabecera (p. ej. `Authorization: Bearer …`) y devuelve **solo la respuesta HTTP**. El texto plano nunca llega al modelo.

## ⚙️ Cómo funciona (aspecto técnico)

Defensa en profundidad: **AES-256-GCM** con IV aleatorios por cifrado; **claves derivadas por usuario con HKDF** para aislar el cifrado por identidad; **sin texto plano en reposo**. El flujo **`use_secret`** es agente → descifrado en servidor → inyección de cabecera → petición HTTP saliente → **solo la respuesta** de vuelta. Las **reglas SSRF** bloquean destinos privados o internos. **Row Level Security (RLS)** limita las filas para que solo los propietarios del playbook vean sus propios secretos —aplicado en la base de datos, no solo en el código de la aplicación.

## Herramientas MCP disponibles

| Herramienta | Qué hace |
|-------------|----------|
| `list_secrets` | Lista solo **nombres y metadatos** de secretos —nunca valores. |
| `use_secret` | Realiza una petición HTTP con un secreto inyectado en el servidor; devuelve la respuesta remota. |
| `store_secret` | Cifra y almacena un nuevo secreto. |
| `rotate_secret` | Sustituye un secreto existente por un valor nuevo. |
| `delete_secret` | Elimina un secreto de forma permanente. |

Los permisos con alcance (`secrets:read` / `secrets:write`) mantienen las integraciones con el mínimo privilegio necesario.

## Ejemplo: llamar a una API con `use_secret`

Ejemplo de carga MCP `tools/call` (la forma exacta depende del cliente):

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

El modelo ve el JSON de origen o el error —**nunca** el token. El mismo patrón sirve para cualquier API HTTPS con autenticación por cabecera que tengas guardada por nombre.

## Gestión en el panel

En el panel, **Secretos** permite **crear**, ver **solo metadatos**, **rotar** y **eliminar**, con **categorías** y seguimiento de **caducidad** —sin mostrar valores en bruto después de guardar.

## Primeros pasos

1. Añade secretos con nombre en el panel (`OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, etc.).
2. Apunta tu cliente MCP al endpoint del playbook y confirma que aparecen las herramientas de secretos.
3. Usa **`use_secret`** para llamadas autenticadas salientes —nunca muestres valores secretos en el chat.

---

[Abrir un Playbook](/dashboard), guarda los secretos una vez y deja que los agentes se integren con APIs externas —sin que las claves entren nunca en el modelo.
