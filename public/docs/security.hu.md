# Biztonsági dokumentumcsomag

Beszállítói értékelési és EIR osztályba sorolási csomag a self-hosted AgentPlaybooks-hoz (NIS2 21. cikk (2) (a), (d), (g); 7/2024. (VI. 24.) MK rendelet NIST SP 800-53 rev. 5 családokra leképezve).

**A magyar a beszállítói értékelés elsődleges nyelve.** A teljes szöveg a repóban van (nem csak ezen az oldalon):

- [docs/security/README.hu.md](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/README.hu.md) — tárgymutató
- [Fehérkönyv](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/whitepaper.hu.md) · [EN](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/whitepaper.md)
- [Eszközleltár](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/asset-inventory.hu.md) · [EN](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/asset-inventory.md)
- [Kockázatelemzés-sablon](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/risk-assessment.hu.md) · [CSV](https://github.com/matebenyovszky/agentplaybooks/blob/main/docs/security/risk-assessment.csv)

Klónozott fában ugyanazok a fájlok a `docs/security/` alatt.

> **Jogi ellenőrzés szükséges.** Ez az oldal nem jogi tanács, nem tanúsítvány, és nem EIR-besorolás. Minden jogi értelmezést az ügyfél IBF-jének és jogászának kell jóváhagynia éles bevezetés előtt.

## Amit a kód ténylegesen csinál (összefoglaló)

Forrásból ellenőrizve; a részletek és a fájlhivatkozások a fehérkönyvben vannak.

| Terület | Van | Nincs |
|---------|-----|-------|
| Kripto | AES-256-GCM, HKDF-SHA-256 felhasználónkénti kulcs, AAD-kötött v2 ciphertext | KMS/HSM, újratitkosítós rotáció |
| TLS / mTLS | Platform TLS a hosted Cloudflare-en; hosted mTLS `cf.tlsClientAuth`; self-host `MTLS_MODE=proxy` megbízható terminátor mögött. **Kész a `main`-en:** [#201](https://github.com/matebenyovszky/agentplaybooks/pull/201) | A Node nem terminál TLS-t; terminátor nélkül a tanúsítványauth fail-closed marad |
| AuthN / AuthZ | Supabase Auth; Entra/Google/GitHub/LinkedIn OIDC ha be van kapcsolva; owner\|editor; API-kulcs szerepek (proposer is) | App-szintű MFA; SAML; **auditor szerep** a `main`-en. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) |
| Audit | `audit_logs` federációra és `secret.*`-ra; tulajdonosi olvasó API | SIEM/syslog export, megőrzés, hash-lánc, skill/memória/vászon írások. **Folyamatban / In progress:** [#202](https://github.com/matebenyovszky/agentplaybooks/pull/202) |
| Lejárat | Kikényszerített titok-`expires_at`; API-kulcs lejárat; mTLS kliens revoke | Háttér-törlő job |
| Self-host | Docker `app` a 3000-es porton; külön Supabase stack kell; helyi Geist woff2 (`next/font/local`); izolált no-egress CI a secrets flow-ra (`deploy/airgap/`). **Kész a `main`-en:** fontok [#200](https://github.com/matebenyovszky/agentplaybooks/pull/200); CI [#204](https://github.com/matebenyovszky/agentplaybooks/pull/204) | A produkciós compose továbbra is csak az `app`; `npm ci` / alapimage az izolálás előtt; `use_secret` pinelés nélkül kilép |
| SDLC | Dependabot, `npm audit:production` a CI-ban, CLI npm provenance, CodeQL, CycloneDX SBOM, SBOM-blob cosign, `SECURITY.md`, incidens-runbook, GitHub privát sérülékenység-jelentés (nincs security e-mail), titkosított helyszíni mentés/restore + üres-gép drill. **Kész a `main`-en:** [#205](https://github.com/matebenyovszky/agentplaybooks/pull/205), [#207](https://github.com/matebenyovszky/agentplaybooks/pull/207), [#203](https://github.com/matebenyovszky/agentplaybooks/pull/203) | Aláírt konténer-registry publikálás |

Üzemeltetési checklist: [Self-Hosting](./self-hosting.md). Architektúra: [Architecture](./architecture.md).

Az élő leltár naprakészen tartása:

```bash
npm run inventory:self-host
npm run docs:check
```
