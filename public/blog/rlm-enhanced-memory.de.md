---
title: Einführung des RLM-erweiterten Speichers - Hierarchischer Kontext für KI-Agenten
description: AgentPlaybooks unterstützt jetzt Recursive Language Model-Prinzipien mit hierarchischen Speicherebenen, Kontextfaltung und intelligenter Archivierung.
date: 2026-01-31
author: Mate Benyovszky
---

# Einführung des RLM-erweiterten Speichers

Wir freuen uns, ein großes Upgrade des AgentPlaybooks-Speichersystems anzukündigen, inspiriert von der **Recursive Language Model (RLM)**-Forschung. Ihre KI-Agenten können nun ihren Kontext durch hierarchische Speicherorganisation aktiv verwalten.

## Die Herausforderung des Kontextfensters

Jedes KI-Modell hat ein begrenztes Kontextfenster. Wenn Gespräche wachsen und Aufgaben sich häufen, verlieren Agenten den Zugang zu früheren Informationen—ein Phänomen, das als **Kontextverschlechterung** bekannt ist.

## Unsere Lösung: Intelligente Speicherebenen

Das neue Speichersystem führt drei Ebenen ein:

### 🔥 Arbeitsspeicher (Working)
Aktiver Aufgabenkontext. Immer vollständig in Prompts geladen.

### 📋 Kontextueller Speicher (Contextual)
Aktuelle Entscheidungen und Hintergrundkontext. Der Agent sieht **Zusammenfassungen**, vollständige Details sind auf Anfrage verfügbar.

### 📚 Langzeitspeicher (Long-term)
Archiviertes Wissen und abgeschlossene Arbeit. Indexiert und durchsuchbar, aber nicht automatisch geladen.

## Neue Agentenfähigkeiten

| Werkzeug | Was es tut |
|----------|------------|
| `consolidate_memories` | Verwandte Erinnerungen zu einer Zusammenfassung kombinieren |
| `promote_memory` | Wichtige Informationen in den Arbeitsspeicher befördern |
| `get_memory_context` | Token-optimierte Ansicht aller Ebenen erhalten |
| `archive_memories` | Abgeschlossene Arbeit in den Langzeitspeicher verschieben |
| `get_memory_tree` | Eltern-Kind-Speicherbeziehungen visualisieren |

## Was dies ermöglicht

1. **Längere Sitzungen**: Agenten können an komplexen, mehrstufigen Projekten arbeiten.
2. **Effiziente Token-Nutzung**: Nur relevante Informationen belegen das Kontextfenster.
3. **Wissensakkumulation**: Abgeschlossene Arbeit geht nicht verloren—sie ist organisiert und abrufbar.

---

Das RLM-erweiterte Speichersystem ist jetzt für alle AgentPlaybooks-Benutzer verfügbar. [Erstellen Sie ein Playbook](/dashboard) und geben Sie Ihren Agenten das Kontextmanagement, das sie verdienen.
