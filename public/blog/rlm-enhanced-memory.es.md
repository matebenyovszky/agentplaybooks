---
title: Presentamos la Memoria Mejorada con RLM - Contexto Jerárquico para Agentes de IA
description: AgentPlaybooks ahora soporta principios de Modelo de Lenguaje Recursivo con niveles de memoria jerárquicos, plegado de contexto y archivado inteligente.
date: 2026-01-31
author: Mate Benyovszky
---

# Presentamos la Memoria Mejorada con RLM

Nos complace anunciar una actualización importante del sistema de memoria de AgentPlaybooks, inspirada en la investigación de **Modelos de Lenguaje Recursivos (RLM)**. Sus agentes de IA ahora pueden gestionar activamente su contexto a través de la organización jerárquica de memoria.

## El Desafío de la Ventana de Contexto

Cada modelo de IA tiene una ventana de contexto finita. A medida que las conversaciones crecen y las tareas se acumulan, los agentes pierden acceso a información anterior—un fenómeno conocido como **deterioro del contexto**.

## Nuestra Solución: Niveles de Memoria Inteligentes

El nuevo sistema de memoria introduce tres niveles:

### 🔥 Memoria de Trabajo (Working)
Contexto de tarea activa. Siempre cargado completamente en los prompts.

### 📋 Memoria Contextual (Contextual)
Decisiones recientes y contexto de fondo. El agente ve **resúmenes**, con detalles completos disponibles bajo demanda.

### 📚 Memoria a Largo Plazo (Long-term)
Conocimiento archivado y trabajo completado. Indexado y buscable, pero no cargado automáticamente.

## Nuevas Capacidades del Agente

| Herramienta | Qué Hace |
|-------------|----------|
| `consolidate_memories` | Combinar memorias relacionadas en un resumen |
| `promote_memory` | Promover información importante a memoria de trabajo |
| `get_memory_context` | Obtener vista optimizada de tokens de todos los niveles |
| `archive_memories` | Mover trabajo completado a almacenamiento a largo plazo |
| `get_memory_tree` | Visualizar relaciones padre-hijo de memoria |

## Qué Permite Esto

1. **Sesiones Más Largas**: Los agentes pueden trabajar en proyectos complejos de múltiples etapas.
2. **Uso Eficiente de Tokens**: Solo la información relevante ocupa la ventana de contexto.
3. **Acumulación de Conocimiento**: El trabajo completado no se pierde—está organizado y recuperable.

---

El sistema de memoria mejorado con RLM está disponible ahora para todos los usuarios de AgentPlaybooks. [Crea un Playbook](/dashboard) y da a tus agentes la gestión de contexto que merecen.
