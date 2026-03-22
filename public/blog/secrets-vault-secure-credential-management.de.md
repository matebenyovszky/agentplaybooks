---
title: Secrets Vault – Credential Management ohne Geheimnis-Offenlegung für KI-Agenten
description: AgentPlaybooks führt einen verschlüsselten Secrets Vault mit einem einzigartigen Proxy-Pattern ein: KI-Agenten können API-Keys und Credentials nutzen, ohne jemals die Klartextwerte zu sehen.
date: 2026-03-22
author: Mate Benyovszky
---

# Secrets Vault: Credential Management ohne Geheimnis-Offenlegung

Wir freuen uns, **Secrets Vault** für AgentPlaybooks vorzustellen—eine sichere Möglichkeit für KI-Agenten, externe APIs mit echten Credentials aufzurufen, ohne dass diese Credentials jemals in Prompts, Logs oder der für den Agenten sichtbaren Tool-Ausgabe erscheinen. Es richtet sich an Teams, die Automatisierung wollen, ohne bei der Schlüsselhygiene Kompromisse einzugehen.

## 🔑 Das Problem: Credentials in der Agent-Schleife

Agenten brauchen **API-Keys und Tokens**, um LLM-APIs, Zahlungssysteme, Webhooks und mehr zu erreichen. Sobald ein Secret im Kontext des Modells landet, steigt das Risiko: **Logs**, **Transkripte**, **Context-Dumps** oder **Memory** können es preisgeben. Sie wollen, dass Agenten mit echten Credentials *handeln*—nicht, dass sie sie *sehen*.

## 🛡️ Unsere Lösung: Das Proxy-Pattern ohne Geheimnis-Offenlegung

Secrets Vault löst das mit einem **Proxy-Pattern**, das um das `use_secret`-Tool herum aufgebaut ist.

Der Agent liest das Secret nie. Er bittet den Server, ein benanntes Secret zu **verwenden**—zum Beispiel: *„Nutze meinen `OPENAI_API_KEY`, um diese URL aufzurufen.“* Der Server entschlüsselt innerhalb der vertrauenswürdigen Grenze, setzt den Header (z. B. `Authorization: Bearer …`) und liefert **nur die HTTP-Antwort** zurück. Klartext erreicht das Modell nie.

## ⚙️ So funktioniert es (technisch)

Defense in depth: **AES-256-GCM** mit pro Verschlüsselung zufälligen IVs; **HKDF-abgeleitete pro-Benutzer-Keys**, damit Ciphertext pro Identität isoliert ist; **kein Klartext at rest**. Der **`use_secret`**-Pfad ist Agent → serverseitige Entschlüsselung → Header injizieren → HTTP hinaus → **nur Antwort** zurück. **SSRF-Regeln** blockieren private/interne Ziele. **Row Level Security (RLS)** schränkt Zeilen so ein, dass nur Playbook-Besitzer ihre eigenen Secrets sehen—durchgesetzt in der Datenbank, nicht nur im App-Code.

## Verfügbare MCP-Tools

| Tool | Funktion |
|------|----------|
| `list_secrets` | Listet nur Secret-**Namen und Metadaten**—nie Werte. |
| `use_secret` | Führt eine HTTP-Anfrage mit serverseitig injiziertem Secret aus; liefert die Remote-Antwort. |
| `store_secret` | Verschlüsselt und speichert ein neues Secret. |
| `rotate_secret` | Ersetzt ein vorhandenes Secret durch einen neuen Wert. |
| `delete_secret` | Entfernt ein Secret dauerhaft. |

Berechtigungen im Scope (`secrets:read` / `secrets:write`) halten Integrationen auf das Minimum nötiger Rechte.

## Beispiel: API-Aufruf mit `use_secret`

Beispiel-MCP-`tools/call`-Payload (Form variiert je Client):

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

Das Modell sieht das Upstream-JSON oder den Fehler—**niemals** den Token. Dasselbe Muster für jede per Header-Auth gesicherte HTTPS-API, die Sie unter einem Namen gespeichert haben.

## Verwaltung im Dashboard

Im Dashboard unterstützt **Secrets** **Anlegen**, **nur-Metadaten**-Ansicht, **Rotation** und **Löschen**, mit **Kategorien** und **Ablauf**-Tracking—ohne Rohwerte nach dem Speichern anzuzeigen.

## Erste Schritte

1. Benannte Secrets im Dashboard hinzufügen (`OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, usw.).
2. Ihren MCP-Client auf den Playbook-Endpunkt zeigen und prüfen, dass die Secrets-Tools erscheinen.
3. **`use_secret`** für ausgehende authentifizierte Aufrufe verwenden—Secret-Werte niemals im Chat offenlegen.

---

[Playbook öffnen](/dashboard), Secrets einmal speichern und Agenten mit externen APIs integrieren lassen—ohne dass die Keys jemals ins Modell gelangen.
