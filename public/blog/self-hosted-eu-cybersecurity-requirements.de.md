---
title: Wie eine selbst gehostete AgentPlaybooks-Instanz hilft, EU-Anforderungen an Cybersicherheit und Datenschutz zu erfüllen
description: Geheimnisse, Protokolle und Playbook-Daten können auf Ihrer eigenen Infrastruktur bleiben. Dieser Beitrag ordnet NIS2, DSGVO, den CRA und verwandte Protokollpflichten den Funktionen zu, die im Code stehen — und den Pflichten, die bei Ihnen bleiben.
date: 2026-10-25
author: Mate Benyovszky
---

# Wie eine selbst gehostete Instanz hilft, EU-Cybersicherheitsanforderungen zu erfüllen

Eine lokale AgentPlaybooks-Instanz ist keine Zertifizierung. Sie kann **helfen, technische Teile** mehrerer EU-Vorgaben **zu erfüllen**, weil **Geheimnisse, Audit-Zeilen und Playbook-Daten auf Infrastruktur bleiben, die Sie betreiben**. Die rechtlichen Pflichten — Risikoanalyse, Meldung, Schulung, DSFA, Härtung — bleiben beim Betreiber.

Das ist eine Erstlektüre öffentlicher Quellen gegen den aktuellen `main`-Branch, keine Rechtsberatung. Was Sie bindet, entscheiden Anwalt und Informationssicherheitsbeauftragte.

## Geheimnisse, Protokolle und Daten bleiben auf Ihrer Infrastruktur

Im gehosteten Dienst läuft die Anwendung auf Cloudflare, die Datenbank auf Supabase. In einer Selbstinstallation betreiben Sie beides. Der Anwendungskontainer spricht die Supabase Data API und Auth an; ein nackter PostgreSQL-Server reicht nicht. Siehe [Self-Hosting](/docs/self-hosting).

Was das konkret heißt:

- Tresorwerte liegen als **AES-256-GCM**-Ciphertext unter einem per-Benutzer-HKDF-Schlüssel. Der Masterschlüssel (`SECRETS_ENCRYPTION_KEY`) steht in *Ihrer* Prozessumgebung. Es gibt kein KMS und kein HSM im Produkt.
- Agenten nutzen benannte Secrets über **`use_secret`** (GET/HEAD) und **`use_secret_write`** (POST/PUT/PATCH/DELETE) oder `POST /api/playbooks/:guid/secrets/proxy`. Der Server entschlüsselt, setzt einen Header und liefert **nur die HTTP-Antwort**. Das Modell sieht den Wert nicht, es sei denn, Sie schalten Reveal für dieses Secret frei.
- Jedes Secret kann Ziele mit **`allowed_hosts`** festnageln. `SECRETS_REQUIRE_ALLOWED_HOSTS=true` macht das Nageln auf Ihrer Instanz Pflicht.
- **`expires_at`** stoppt Proxy, Föderation und API-Key-Reveal. Die Eigentümerin kann den Wert im Dashboard weiter öffnen, um ihn zu ersetzen.
- Zertifikatsklienten (`secret_clients`) brauchen im Self-Host einen TLS-Terminator und **`MTLS_MODE=proxy`**, der Fingerprint-Header nur von `MTLS_TRUSTED_PROXIES` akzeptiert. Ohne Terminator bleibt Zertifikatsauth geschlossen.
- Anmeldung lässt sich mit **Microsoft Entra ID** auf Ihren Tenant begrenzen (`GOTRUE_EXTERNAL_AZURE_*` an GoTrue). Es gibt keine Anwendungs-MFA; MFA ist eine IdP-Kontrolle.
- **`audit_logs`** zeichnet Tresoroperationen (`secret.*`) und föderierte MCP-Aufrufe auf. Eine Ablehnung ist ein Ereignis. Zeilen behalten einen Hostnamen, keine volle URL und keinen Secret-Wert. Auf `main` ist das Lesen eigentümerseitig (`GET /api/playbooks/:guid/audit`, Limit 500). Skills-, Memory- und Canvas-Schreibvorgänge werden nicht protokolliert.
- Verschlüsseltes On-Prem-Backup und eine Restore-Übung auf leerer Maschine sind dokumentiert. Der Masterschlüssel liegt **nie** im Archiv.

Nationale Umsetzungsregeln (zum Beispiel das ungarische Cybersicherheitsgesetz von 2024 und die Meldefristen 24 Stunden / 72 Stunden / ein Monat) bleiben Pflicht des Betreibers.

## Anforderung und Funktion

„Hilft bei“ ist nicht „erfüllt“. Die Durchführungsverordnung (EU) 2024/2690 konkretisiert technische und methodische Anforderungen nach NIS2 Artikel 21; Auswahl, Betrieb und Nachweis der Kontrollen bleiben Ihre.

| Instrument | Was es verlangt (schlichte Lesart) | Wobei eine lokale Instanz hilft |
| --- | --- | --- |
| NIS2 Art. 21 — Risikomanagementmaßnahmen | Systemsicherheit, Kryptografie, Zugang, Lieferkette, Protokollierung, Backup, Schwachstellenbehandlung | Datenresidenz auf Ihrem Stack; AES-256-GCM-Tresor; `use_secret`, damit der Agent den Wert nicht sieht; `allowed_hosts` + SSRF-Filter; Entra-SSO-Hook; owner/editor-RBAC |
| NIS2 Art. 21 Abs. 2 Buchst. c — Backup und Wiederherstellung | Backup-Management und Disaster Recovery | [On-Prem-Backup und Restore](/docs/backup-restore), verschlüsselte Archive, Empty-Machine-Drill in CI |
| NIS2 Art. 21 Abs. 2 Buchst. d — Lieferkette | Herkunft von IKT | CycloneDX-SBOMs, Cosign von SBOM-Blobs auf `cli-v*`-Tags, CodeQL, Dependabot, npm-Provenance für die CLI. Keine signierte Container-**Registry**-Veröffentlichung |
| NIS2 Art. 21 Abs. 2 Buchst. e — Schwachstellenbehandlung | Prozess zum Empfang und zur Behebung | [SECURITY.md](https://github.com/matebenyovszky/agentplaybooks/blob/main/SECURITY.md) und [GitHub Private Vulnerability Reporting](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new). Maintainer-Review ist best-effort; gesetzliche Uhren sind Ihre |
| NIS2 Art. 21 Abs. 2 Buchst. f und Art. 23 — Protokollierung und Meldung | Erkennen, protokollieren, erhebliche Vorfälle melden | `audit_logs` für Tresor und föderierte Aufrufe. Das Produkt **meldet nicht** bei einer Behörde. Hash-Kette, Export, Aufbewahrung, Auditor-Rolle und SIEM-Weiterleitung stehen in [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) und sind **noch nicht auf `main`** |
| Durchführungs-VO (EU) 2024/2690 | Technische und methodische Anforderungen zu Art. 21 | Die Zeilen oben sind Produktbeiträge. Die Abbildung auf 2024/2690-Familien ist ein Betreiberdokument |
| DSGVO Art. 5, 25, 32 | Zweckbindung, Datenschutz durch Technikgestaltung, Sicherheit der Verarbeitung | Secrets standardmäßig nicht im Modellkontext; Ciphertext at rest; Self-Host, damit Sie Region und Auftragsverarbeiter wählen |
| DSGVO Art. 13 | Informationen für betroffene Personen | Im Self-Host sind Sie in der Regel der Verantwortliche und müssen selbst informieren. Der gehostete Datenschutzhinweis gilt nicht für Ihre Instanz |
| CRA (EU) 2024/2847 | Produkte mit digitalen Elementen, die im Rahmen einer Geschäftstätigkeit in Verkehr gebracht werden | Kostenlose, nicht monetarisierte Open-Source-Software gilt derzeit als außerhalb dieses Geschäftstätigkeitstests (Erwägungsgrund 18). SBOMs und Schwachstellenbehandlung liegen bereits im Repo, falls sich der Status später ändert |
| DORA (EU) 2022/2554 | IKT-Protokollierung und Vorfallmeldung für erfasste Finanzunternehmen | Bindet DORA Sie, bleiben die Pflichten Ihre. Eine lokale Instanz hält die betreffenden Protokolle auf Ihren Systemen |
| KI-VO (EU) 2024/1689 | Protokollierung / Aufzeichnungen für Hochrisiko-Systeme (Art. 12) und Betreiber (Art. 26) | Das Produkt stuft Ihr KI-System nicht ein. Tresor- und Föderations-Auditzeilen können Ihre Aufzeichnungen speisen, wenn Sie in den Anwendungsbereich fallen |

### Optionale ISO/IEC-27001- und NIST-SP-800-53-Karte

Das ist eine Lesehilfe, keine ISO-27001- oder NIST-Bewertung.

| Thema | Produktseite (heute) |
| --- | --- |
| Kryptografie (ISO 27001 A.8.24 / NIST SC) | AES-256-GCM, HKDF pro Benutzer, AAD-gebundenes v2-Ciphertext. Kein KMS |
| Protokollierung (A.8.15 / AU) | `audit_logs` wie oben; Kette/Export/SIEM warten auf #202 |
| Backup (A.8.13 / CP) | Verschlüsselter Dump + Restore-Drill; RPO/RTO setzen Sie |
| Zugang (A.5.15 / AC, IA) | owner / editor; Entra OIDC; Self-Host-mTLS über vertrauenswürdigen Proxy |
| Lieferkette (A.5.21 / SR, SI) | Lockfiles, CodeQL, CycloneDX, Cosign von SBOM-Blobs |

Eine ausführlichere Familientabelle steht im [Sicherheitsdokumentationspaket](/docs/security).

## Was Aufgabe des Betreibers bleibt

Die Software erledigt das nicht für Sie:

- **Risikomanagement** — Einstufung, Art.-21-Politik, Kontrollauswahl nach 2024/2690, Restrisiko.
- **Vorfallmeldung** — Uhren nach NIS2 Art. 23 (Frühwarnung, Meldung, Abschlussbericht). Das [Incident-Runbook](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/incident-runbook.md) ist eine Vorlage für *Ihr* Meldepaket.
- **Schulung** — Art. 21 Abs. 2 Buchst. g ist eine Organisationskontrolle, kein Produktmerkmal.
- **Infrastrukturhärtung** — TLS-Terminierung, Netzisolation, Patchfenster, Räume, IdP-MFA. Compose startet die App auf Port 3000; es terminiert kein TLS und startet kein Supabase.
- **DSFA und DSGVO-Rollen** — im Self-Host entscheiden Sie in der Regel über Zwecke und Mittel. DSFA, Verarbeitungsverzeichnis und Art.-13-Hinweise sind Ihre, wenn personenbezogene Daten im Spiel sind.

Ehrliche Lücken auf `main`: kein KMS/HSM, keine Neuverschlüsselung beim Masterkey-Wechsel, keine App-MFA, kein SAML, keine Auditor-Rolle, keine Hash-Kette, kein SIEM-Export, kein signiertes Container-Registry-Image, CSP ist Report-Only.

## Funktionen, die mit Pull Request #202 kommen

Behandeln Sie Folgendes nicht als ausgeliefert. Es ist auf Branch `cursor/audit-logs-compliance-adfd` (Head `54ea3c6`) in [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) umgesetzt und sollte auf `main` sein, bevor dieser Beitrag als aktuell gilt:

- **Hash-Kette / Manipulationshinweis** — SHA-256-Kette pro Playbook (`hash = sha256(kanonisches JSON einschließlich prev_hash)`), Genesis aus 64 Null-Hexziffern, Insert-Trigger, unveränderliche Zeilen, `GET /api/playbooks/:guid/audit/verify` und `apb audit verify` (HTTP 409 bei gebrochenem Glied).
- **Export** — `format` json, jsonl oder csv an der Audit-API, `GET /api/playbooks/:guid/audit/export` (Standard JSONL), `apb audit export`.
- **Aufbewahrung** — `AUDIT_RETENTION_DAYS` ungesetzt / `0` / `forever` behält Zeilen; Purge schreibt einen Ketten-Checkpoint und ein `audit.retention_purge`-Ereignis.
- **Auditor-Rolle** — Collaborator `auditor` und API-Key-Rolle `auditor` (plus User-Key-Scope `audit:read`). Nur Lesen, Export, Prüfen. Keine Secret-Werte, keine Schreibzugriffe.
- **SIEM / syslog** — optionales `AUDIT_SYSLOG_URL` (RFC 5424) und `AUDIT_SIEM_WEBHOOK_URL` mit HMAC-Schlüssel von mindestens 32 Zufallsbytes. Weiterleitung ist fire-and-forget und darf den Tresor nicht blockieren.
- **Keine Secrets in der Spur** — `tests/api/audit-secrets-not-logged.test.ts` auf diesem SHA ist **ein** End-to-End-Fall: gespeicherte Zeile, JSON/JSONL/CSV-Export, syslog und SIEM-Body dürfen weder den rohen API-Key noch Secret-Klartext enthalten. Weitere **21** `it()`-Fälle auf demselben SHA decken Export, Kette, Aufbewahrung, Auditor und Weiterleitung ab.

Dieser Blogbeitrag sollte erst nach der Landung von #202 auf `main` als aktuell gelten.

## Lokal bereitstellen

Folgen Sie den bestehenden Leitfäden, nicht nur dieser Kurzfassung:

1. [Self-Hosting](/docs/self-hosting) — `supabase/schema.sql` für eine neue Datenbank, selbst gehostetes Supabase (kein nacktes Postgres), Docker-`app` auf Port 3000 oder Cloudflare Pages. `NEXT_PUBLIC_APP_URL` und `SECRETS_ENCRYPTION_KEY` zur **Build**-Zeit setzen.
2. [Self-hosted mTLS](/docs/self-hosted-mtls) — Terminator + `MTLS_MODE=proxy`, wenn Sie Zertifikatsklienten nutzen.
3. [On-Prem-Backup und Restore](/docs/backup-restore) — derselbe Text wie `docs/self-host/backup-restore.md` im Repository; `scripts/self-host/backup.sh` und der Empty-Machine-Drill.
4. Air-Gap-Optionen auf der Self-Hosting-Seite: `NO_EGRESS=true`, `SECRETS_REQUIRE_ALLOWED_HOSTS=true`, lokale Geist-Schriften (`next/font/local`). Isolierte No-Egress-CI: `.github/workflows/no-egress.yml` und `deploy/airgap/`. Production-Compose ist weiterhin nur die App; `npm ci` und Basisimages brauchen vor der Isolation eine Registry.
5. Entra ID: `GOTRUE_EXTERNAL_AZURE_*` wie im Self-Hosting-Leitfaden.
6. Sicherheitspaket: [Sicherheitsdokumentation](/docs/security). Schwachstellenmeldungen: [GitHub-Formular für private Advisories](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new) — es gibt keine Security-E-Mail.

Weiterlesen: [Secrets Vault](/blog/secrets-vault-secure-credential-management), [Python secrets](/docs/python-secrets).

## Hinweis

Dieser Artikel ist **keine Rechtsberatung** und **keine Zertifizierung**. Der Betrieb von AgentPlaybooks, auch auf eigenen Maschinen, verleiht keinen NIS2-, DSGVO-, CRA-, DORA- oder KI-VO-Status. Der Betreiber bleibt für das verantwortlich, was das Recht von seiner Organisation verlangt. Rechtliche Deutungen hier brauchen vor dem Produktionseinsatz eine Prüfung.
