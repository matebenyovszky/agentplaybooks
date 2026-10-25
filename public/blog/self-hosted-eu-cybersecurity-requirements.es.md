---
title: Cómo una instancia autoalojada de AgentPlaybooks ayuda a cubrir requisitos de ciberseguridad y protección de datos de la UE
description: Los secretos, los registros y los datos de los playbooks pueden permanecer en tu propia infraestructura. Esta nota relaciona NIS2, el RGPD, el CRA y las normas de registro con funciones que existen en el código — y con las obligaciones que siguen siendo tuyas.
date: 2026-10-25
author: Mate Benyovszky
---

# Cómo una instancia autoalojada ayuda a cubrir requisitos de ciberseguridad de la UE

Una instancia local de AgentPlaybooks no es una certificación. Puede **ayudar a cubrir** partes técnicas de varias normas de la UE porque **los secretos, las filas de auditoría y los datos de los playbooks permanecen en infraestructura que operas tú**. Las obligaciones jurídicas — análisis de riesgo, notificación de incidentes, formación, EIPD, endurecimiento — siguen siendo del operador.

Esta es una primera lectura de fuentes públicas frente a la rama `main` actual, no un asesoramiento jurídico. Qué te vincula lo deciden tu abogado y la persona responsable de la seguridad de la información.

## Los secretos, los registros y los datos se quedan en tu infraestructura

En el servicio alojado, la aplicación corre en Cloudflare y la base de datos en Supabase. En una instalación propia operas ambas. El contenedor de la aplicación habla con la Data API y Auth de Supabase; un servidor PostgreSQL desnudo no basta. Véase [Autoalojamiento](/docs/self-hosting).

En la práctica:

- Los valores de la caja fuerte se guardan como texto cifrado **AES-256-GCM** bajo una clave HKDF por usuario. La clave maestra (`SECRETS_ENCRYPTION_KEY`) vive en el entorno de *tu* proceso. No hay KMS ni HSM en el producto.
- Los agentes usan secretos con nombre mediante **`use_secret`** (GET/HEAD) y **`use_secret_write`** (POST/PUT/PATCH/DELETE), o `POST /api/playbooks/:guid/secrets/proxy`. El servidor descifra, inyecta una cabecera y devuelve **solo la respuesta HTTP**. El modelo no ve el valor salvo que actives reveal para ese secreto.
- Cada secreto puede fijar destinos con **`allowed_hosts`**. `SECRETS_REQUIRE_ALLOWED_HOSTS=true` hace obligatorio el fijado en tu instancia.
- **`expires_at`** detiene el proxy, la federación y el reveal con clave de API. El propietario aún puede abrir el valor en el panel para sustituirlo.
- Los clientes con certificado (`secret_clients`) en autoalojamiento necesitan un terminador TLS y **`MTLS_MODE=proxy`**, que solo confía cabeceras de huella desde `MTLS_TRUSTED_PROXIES`. Sin terminador, la autenticación por certificado queda cerrada.
- El inicio de sesión puede limitarse a tu inquilino con **Microsoft Entra ID** (`GOTRUE_EXTERNAL_AZURE_*` en GoTrue). No hay MFA a nivel de aplicación; el MFA es un control del IdP.
- **`audit_logs`** registra operaciones de la caja fuerte (`secret.*`) y llamadas MCP federadas. Una denegación es un evento. Las filas guardan un nombre de host, no una URL completa ni el valor del secreto. En `main`, la lectura es del propietario (`GET /api/playbooks/:guid/audit`, límite 500). Las escrituras de skills, memoria y canvas no se registran.
- La copia de seguridad cifrada en las instalaciones y un ensayo de restauración en máquina vacía están documentados. La clave maestra **nunca** va dentro del archivo.

Las normas nacionales de transposición (por ejemplo la ley húngara de ciberseguridad de 2024 y los plazos de notificación de 24 horas / 72 horas / un mes) siguen siendo obligación del operador.

## Requisito y función

«Ayuda con» no es «cumple». El Reglamento de ejecución (UE) 2024/2690 detalla requisitos técnicos y metodológicos del artículo 21 de NIS2; tú sigues eligiendo, operando y evidenciando los controles.

| Instrumento | Qué pide (lectura llana) | En qué ayuda una instancia local |
| --- | --- | --- |
| NIS2 art. 21 — medidas de gestión del riesgo | Seguridad de los sistemas, criptografía, acceso, cadena de suministro, registro, copia de seguridad, tratamiento de vulnerabilidades | Residencia de datos en tu pila; caja fuerte AES-256-GCM; `use_secret` para que el agente no vea el valor; `allowed_hosts` + filtros SSRF; gancho SSO de Entra; RBAC owner/editor |
| NIS2 art. 21, apdo. 2, letra c — copia y recuperación | Gestión de copias y recuperación ante desastres | [Copia y restauración in situ](/docs/backup-restore), archivos cifrados, ensayo en máquina vacía en CI |
| NIS2 art. 21, apdo. 2, letra d — cadena de suministro | Procedencia de las TIC | SBOM CycloneDX, cosign de blobs SBOM en etiquetas `cli-v*`, CodeQL, Dependabot, procedencia npm del CLI. No hay publicación firmada en un **registro** de contenedores |
| NIS2 art. 21, apdo. 2, letra e — vulnerabilidades | Proceso para recibir y corregir | [SECURITY.md](https://github.com/matebenyovszky/agentplaybooks/blob/main/SECURITY.md) y [informes privados de GitHub](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new). La revisión de los maintainers es best-effort; los relojes legales son tuyos |
| NIS2 art. 21, apdo. 2, letra f y art. 23 — registro y notificación | Detectar, registrar y notificar incidentes significativos | `audit_logs` para la caja fuerte y las llamadas federadas. El producto **no** presenta notificaciones ante una autoridad. Cadena de hashes, exportación, retención, rol auditor y reenvío SIEM están en [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) y **aún no están en `main`** |
| Reglamento de ejecución (UE) 2024/2690 | Requisitos técnicos y metodológicos de las medidas del art. 21 | Las filas anteriores son aportes del producto. Mapearlas a las familias de 2024/2690 es un documento del operador |
| RGPD arts. 5, 25 y 32 | Limitación de la finalidad, protección de datos desde el diseño, seguridad del tratamiento | Secretos fuera del contexto del modelo por defecto; texto cifrado en reposo; autoalojamiento para elegir región y encargados |
| RGPD art. 13 | Información a los interesados | En autoalojamiento sueles ser el responsable y debes informar tú. El aviso de privacidad alojado no cubre tu instancia |
| CRA (UE) 2024/2847 | Productos con elementos digitales comercializados en el marco de una actividad comercial | El código abierto gratuito y no monetizado se trata hoy como fuera de esa prueba de actividad comercial (considerando 18). Los SBOM y el tratamiento de vulnerabilidades ya están en el repositorio por si ese estatus cambia |
| DORA (UE) 2022/2554 | Registro TIC y notificación de incidentes para entidades financieras incluidas | Si DORA te vincula, esas obligaciones siguen siendo tuyas. Una instancia local guarda los registros pertinentes en tus sistemas |
| Reglamento de IA (UE) 2024/1689 | Registro / conservación para sistemas de alto riesgo (art. 12) y desplegadores (art. 26) | El producto no clasifica tu sistema de IA. Las filas de auditoría de la caja fuerte y la federación pueden alimentar *tu* conservación si estás en el ámbito |

### Mapa opcional ISO/IEC 27001 y NIST SP 800-53

Es una ayuda de lectura, no una evaluación ISO 27001 ni NIST.

| Tema | Lado del producto (hoy) |
| --- | --- |
| Criptografía (ISO 27001 A.8.24 / NIST SC) | AES-256-GCM, HKDF por usuario, ciphertext v2 ligado a AAD. Sin KMS |
| Registro (A.8.15 / AU) | `audit_logs` como arriba; cadena/exportación/SIEM esperan a #202 |
| Copia (A.8.13 / CP) | Volcado cifrado + ensayo de restauración; el RPO/RTO lo fijas tú |
| Acceso (A.5.15 / AC, IA) | owner / editor; Entra OIDC; mTLS autoalojado vía proxy de confianza |
| Cadena de suministro (A.5.21 / SR, SI) | lockfiles, CodeQL, CycloneDX, cosign de blobs SBOM |

Hay una tabla de familias más completa en el [paquete de documentación de seguridad](/docs/security).

## Lo que sigue siendo responsabilidad del operador

El software no hace esto por ti:

- **Gestión del riesgo** — clasificación, política del art. 21, selección de controles bajo 2024/2690, riesgo residual.
- **Notificación de incidentes** — relojes del art. 23 de NIS2 (alerta temprana, notificación, informe final). El [runbook de incidentes](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/incident-runbook.md) es una plantilla para *tu* expediente.
- **Formación** — el art. 21, apdo. 2, letra g, es un control organizativo, no una función del producto.
- **Endurecimiento de la infraestructura** — terminación TLS, aislamiento de red, ventanas de parcheo, salas físicas, MFA del IdP. Compose arranca la app en el puerto 3000; no termina TLS y no arranca Supabase.
- **EIPD y roles del RGPD** — en autoalojamiento sueles decidir fines y medios. La EIPD, el registro de actividades y los avisos del art. 13 son tuyos si hay datos personales.

Lagunas honestas en `main`: no hay KMS/HSM, no hay recifrado al cambiar la clave maestra, no hay MFA de aplicación, no hay SAML, no hay rol auditor, no hay cadena de hashes, no hay exportación SIEM, no hay imagen firmada en un registro de contenedores, la CSP es Report-Only.

## Funciones que llegan con el pull request #202

No las trates como entregadas. Están implementadas en la rama `cursor/audit-logs-compliance-adfd` (cabeza `54ea3c6`) en [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) y deberían estar en `main` antes de dar por actual esta nota:

- **Cadena de hashes / evidencia de manipulación** — cadena SHA-256 por playbook (`hash = sha256(JSON canónico incluyendo prev_hash)`), génesis de 64 dígitos hexadecimales a cero, disparador de inserción, filas inmutables, `GET /api/playbooks/:guid/audit/verify` y `apb audit verify` (HTTP 409 si se rompe un eslabón).
- **Exportación** — `format` json, jsonl o csv en la API de auditoría, `GET /api/playbooks/:guid/audit/export` (JSONL por defecto), `apb audit export`.
- **Retención** — `AUDIT_RETENTION_DAYS` sin definir / `0` / `forever` conserva filas; la purga escribe un punto de control de la cadena y un evento `audit.retention_purge`.
- **Rol auditor** — colaborador `auditor` y rol de clave de API `auditor` (más el alcance de clave de usuario `audit:read`). Solo lectura, exportación y verificación. Sin valores de secreto, sin escrituras.
- **SIEM / syslog** — `AUDIT_SYSLOG_URL` opcional (RFC 5424) y `AUDIT_SIEM_WEBHOOK_URL` con una clave HMAC de al menos 32 bytes aleatorios. El reenvío es fire-and-forget y no debe bloquear la caja fuerte.
- **Sin secretos en la traza** — `tests/api/audit-secrets-not-logged.test.ts` en ese SHA es **un** caso de extremo a extremo: la fila almacenada, la exportación JSON/JSONL/CSV, el syslog y el cuerpo SIEM no deben contener ni la clave de API en bruto ni el texto en claro del secreto. Otros **21** casos `it()` en el mismo SHA cubren exportación, cadena, retención, auditor y reenvío.

Esta entrada del blog solo debería publicarse como actual después de que #202 esté en `main`.

## Cómo desplegar en local

Sigue las guías existentes, no solo este resumen:

1. [Autoalojamiento](/docs/self-hosting) — `supabase/schema.sql` para una base nueva, Supabase autoalojado (no Postgres desnudo), `app` Docker en el puerto 3000 o Cloudflare Pages. Fija `NEXT_PUBLIC_APP_URL` y `SECRETS_ENCRYPTION_KEY` en el **build**.
2. [mTLS autoalojado](/docs/self-hosted-mtls) — terminador + `MTLS_MODE=proxy` si usas clientes con certificado.
3. [Copia y restauración in situ](/docs/backup-restore) — el mismo texto que `docs/self-host/backup-restore.md` en el repositorio; `scripts/self-host/backup.sh` y el ensayo en máquina vacía.
4. Opciones de aislamiento en la página de autoalojamiento: `NO_EGRESS=true`, `SECRETS_REQUIRE_ALLOWED_HOSTS=true`, fuentes Geist locales (`next/font/local`). CI sin salida aislada: `.github/workflows/no-egress.yml` y `deploy/airgap/`. El compose de producción sigue siendo solo la app; `npm ci` y las imágenes base aún necesitan un registro antes del aislamiento.
5. Entra ID: `GOTRUE_EXTERNAL_AZURE_*` según la guía de autoalojamiento.
6. Paquete de seguridad: [Documentación de seguridad](/docs/security). Informes de vulnerabilidades: [formulario privado de GitHub](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new) — no hay correo de seguridad.

Lectura relacionada: [Secrets Vault](/blog/secrets-vault-secure-credential-management), [Python secrets](/docs/python-secrets).

## Descargo

Este artículo **no es asesoramiento jurídico** y **no es una certificación**. Ejecutar AgentPlaybooks, también en tus propias máquinas, no confiere estatus NIS2, RGPD, CRA, DORA ni del Reglamento de IA. El operador sigue siendo responsable de lo que el derecho exige a su organización. Las interpretaciones jurídicas de aquí necesitan revisión antes del uso en producción.
