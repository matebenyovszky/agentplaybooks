---
title: Playbooks sicher teilen — gemeinsam bearbeiten, ohne API-Schlüssel weiterzugeben
description: In AgentPlaybooks können Eigentümer menschliche Editoren über sichere Einmal-Links einladen, während Secrets, API-Schlüssel, Sichtbarkeit und Löschen dem Eigentümer vorbehalten bleiben.
date: 2026-07-21
author: Mate Benyovszky
---

# Playbooks sicher im Team teilen

Ein gutes Playbook entsteht selten vollständig allein. Eine nützliche Agentenkonfiguration verbindet Fachwissen, eine sorgfältig abgestimmte Persona, Skills, Werkzeuge, Memory und Arbeitsdokumente — oft mit Beiträgen mehrerer Personen.

AgentPlaybooks unterstützt jetzt die **Zusammenarbeit mit menschlichen Editoren**. Ein Eigentümer lädt ein Teammitglied ein, dieses nimmt die Einladung mit dem eigenen Konto an, und das geteilte Playbook erscheint direkt im Dashboard. Keine gemeinsam genutzten Passwörter, keine Übertragung des Eigentums und kein Agenten-API-Schlüssel als Ersatz für eine menschliche Anmeldung.

## Warum nicht einfach einen Admin-API-Schlüssel teilen?

API-Schlüssel sind gute Maschinenzugänge, aber schlechte menschliche Identitäten. Ein Bearer-Schlüssel kann kopiert, weitergeleitet, in ein Skript eingebaut oder von mehreren Personen verwendet werden, ohne sie zuverlässig unterscheiden zu können. Soll nur eine Person den Zugriff verlieren, müssen unter Umständen alle Integrationen denselben Schlüssel rotieren.

Eine Editor-Einladung löst ein anderes Problem. Der Zugriff wird an das authentifizierte Konto gebunden, das den Link annimmt, ist für den Eigentümer sichtbar und kann unabhängig widerrufen werden. Playbook-API-Schlüssel bleiben für Agenten und Integrationen bestimmt; die Teammitgliedschaft bleibt eine menschliche Zugriffsentscheidung.

## Ein bewusst einfaches Rollenmodell

Für die erste Version haben wir ein KISS-orientiertes Modell gewählt: Jedes Playbook hat einen **Eigentümer**, und Mitwirkende besitzen eine Rolle, **Editor**.

Editoren können die Inhalte bearbeiten, die den Agenten nützlich machen:

- Name, Beschreibung, Konfiguration und Tags;
- Persona und Systemanweisungen;
- Skills und Skill-Anhänge;
- MCP-Serverdefinitionen;
- Canvas-Dokumente und Memory.

Die sicherheitsrelevante Kontrolle bleibt ausschließlich beim Eigentümer:

- Sichtbarkeit und Veröffentlichung;
- Einladungen und Entfernen von Editoren;
- Playbook-API-Schlüssel;
- verschlüsselte Secrets;
- Eigentum und Löschen.

So vermeiden wir eine unübersichtliche Berechtigungsmatrix und verhindern zugleich, dass ein Editor den eigenen Zugriff erweitert oder Zugangsdaten offenlegt.

## So funktionieren Einladungen

Öffne ein Playbook, wähle **Sharing** und erstelle einen Editor-Link. Der Link wird einmal angezeigt, läuft nach **72 Stunden** ab und kann nur von einem Konto angenommen werden. Sende ihn über einen vertrauenswürdigen privaten Kanal.

Im Hintergrund verwendet jede Einladung 256 Bit kryptografische Zufälligkeit. AgentPlaybooks speichert nur einen SHA-256-Hash, nicht das rohe Token. Die Annahme erfolgt atomar, sodass zwei gleichzeitige Anfragen denselben Link nicht erfolgreich wiederverwenden können. Der Eigentümer kann einen ausstehenden Link widerrufen oder einen aktiven Editor jederzeit entfernen.

Nach der Annahme erscheint das Playbook mit einem **Shared**-Hinweis im Dashboard des Editors. Der ursprüngliche Eigentümer bleibt unverändert.

## Was dadurch möglich wird

- Entwickler und Fachexperten können dieselben Agentenanweisungen gemeinsam pflegen.
- Kleine Teams verbessern Skills und MCP-Integrationen ohne Export und erneuten Import.
- Editoren halten Memory und Canvas-Dokumente aktuell, während der Eigentümer Zugangsdaten und Veröffentlichung schützt.
- Zugriff kann entfernt werden, ohne die API-Schlüssel produktiver Agenten zu verändern.

Die Zusammenarbeit ist jetzt im Dashboard verfügbar. Lies den vollständigen [Leitfaden zur Team Collaboration](/docs/team-collaboration), öffne dann [dein Dashboard](/dashboard) und lade deinen ersten Editor ein.
