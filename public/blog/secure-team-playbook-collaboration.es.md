---
title: Comparte playbooks de forma segura — edición en equipo sin compartir claves API
description: AgentPlaybooks permite invitar a editores humanos mediante enlaces seguros de un solo uso, manteniendo secretos, claves API, visibilidad y eliminación bajo control del propietario.
date: 2026-07-21
author: Mate Benyovszky
---

# Comparte playbooks de forma segura con tu equipo

Un buen playbook rara vez se crea en solitario. Una configuración de agente útil combina conocimiento especializado, una persona cuidadosamente ajustada, skills, herramientas, memoria y documentos de trabajo, a menudo con aportaciones de varias personas.

AgentPlaybooks ahora admite la **colaboración con editores humanos**. El propietario invita a un compañero, este acepta con su propia cuenta y el playbook compartido aparece directamente en su panel. Sin contraseñas compartidas, sin transferir la propiedad y sin usar una clave API de agente como inicio de sesión humano.

## ¿Por qué no compartir una clave API de Admin?

Las claves API son excelentes credenciales para máquinas, pero malas identidades humanas. Una clave bearer puede copiarse, reenviarse, incluirse en un script o utilizarse por varias personas sin poder distinguirlas de forma fiable. Retirar el acceso a una persona también puede obligar a rotar la clave en todas las integraciones que la utilizan.

Una invitación de editor resuelve otro problema. El acceso queda vinculado a la cuenta autenticada que acepta el enlace, es visible para el propietario y puede revocarse de forma independiente. Las claves API del playbook siguen siendo para agentes e integraciones; la pertenencia al equipo sigue siendo una decisión de acceso humano.

## Un modelo de roles deliberadamente simple

Para la primera versión elegimos un modelo basado en KISS: cada playbook tiene un **Propietario** y los colaboradores tienen un único rol, **Editor**.

Los editores pueden modificar el contenido que hace útil al agente:

- nombre, descripción, configuración y etiquetas;
- persona e instrucciones del sistema;
- skills y archivos adjuntos de skills;
- definiciones de servidores MCP;
- documentos de canvas y memoria.

El propietario conserva el control exclusivo del límite de seguridad:

- visibilidad y publicación;
- invitaciones y eliminación de colaboradores;
- claves API del playbook;
- secretos cifrados;
- propiedad y eliminación.

Así evitamos una matriz de permisos difícil de entender y, al mismo tiempo, impedimos que un editor amplíe su propio acceso o exponga credenciales.

## Cómo funcionan las invitaciones

Abre un playbook, selecciona **Sharing** y crea un enlace de editor. El enlace se muestra una sola vez, caduca después de **72 horas** y solo puede aceptarlo una cuenta. Envíalo mediante un canal privado de confianza.

Internamente, cada invitación utiliza 256 bits de aleatoriedad criptográfica. AgentPlaybooks almacena únicamente un hash SHA-256, no el token original. La aceptación es atómica, por lo que dos solicitudes simultáneas no pueden reutilizar con éxito el mismo enlace. El propietario puede revocar un enlace pendiente o eliminar a un editor activo en cualquier momento.

Después de aceptarlo, el playbook aparece en el panel del editor con una insignia **Shared**. El propietario original no cambia.

## Qué permite esta función

- Un desarrollador y un experto de dominio pueden mantener juntos las instrucciones del agente.
- Un equipo pequeño puede mejorar skills e integraciones MCP sin exportar ni volver a importar archivos.
- Un editor puede mantener al día la memoria y los documentos de canvas mientras el propietario protege las credenciales y la publicación.
- El acceso puede retirarse sin afectar a las claves API utilizadas por agentes en producción.

La colaboración ya está disponible en el panel. Lee la [guía completa de Team Collaboration](/docs/team-collaboration), abre [tu panel](/dashboard) e invita a tu primer editor.
