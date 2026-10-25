---
title: Önhosztolt mTLS titkos kliensekhez
---

# Önhosztolt mTLS titkos kliensekhez

A hosztolt AgentPlaybooks a Cloudflare megbízható TLS-kontextusából azonosítja
a tanúsítványos klienseket. A Dockeres, Node-os és helyi telepítésnek ez a
kontextusa nincs, ezért a tanúsítványos mód ott zárva marad, amíg egy TLS
lezáró a alkalmazás előtt ellenőrzi a klienstanúsítványt, és továbbítja az
azonosítót.

Az API-kulcsos hitelesítés változatlan. Sikertelen mTLS soha nem esik vissza
hordozó kulcsra.

## Környezeti változók

| Változó | Alapértelmezés | Leírás |
|---------|----------------|--------|
| `MTLS_MODE` | `cloudflare` | `cloudflare` (éles alapértelmezés), `proxy` (megbízható lezáró), vagy `off`. Ismeretlen érték zárva marad. |
| `MTLS_PROXY_FINGERPRINT_HEADER` | nincs | A proxy által ellenőrzés után beállított kérésfejléc. `proxy` módban kötelező. |
| `MTLS_PROXY_VERIFY_HEADER` | nincs | Opcionális. Ha be van állítva, a fejlécnek pontosan `SUCCESS` kell lennie, különben a kérés elutasításra kerül. |
| `MTLS_TRUSTED_PROXIES` | nincs | A TLS-lezáró IP-címei vagy CIDR-tartományai, vesszővel. `proxy` módban kötelező. Üres vagy hibás lista zárva marad. |

A `MTLS_MODE=cloudflare` az éles alapértelmezés, a meglévő Cloudflare-telepítés
nem változik. A nyilvános hosztolt példányon ne kapcsoljuk be a `proxy` módot.

Az origin a tanúsítvány DER-jének SHA-256 kivonatát számolja, ugyanazt, mint az
`openssl x509 -noout -fingerprint -sha256`. A fingerprint-fejléc lehet:

- 64 hexadecimális karakter, kettősponttal vagy anélkül, tetszőleges kis-nagybetű
- az ellenőrzött klienstanúsítvány PEM-je (vagy URI-kódolt PEM-je)

A kész nginx `$ssl_client_fingerprint` SHA-1, és nem egyezik a regisztrációval.
Helyette a `$ssl_client_escaped_cert` értéket továbbítsuk, vagy a Caddy SHA-256
helyettesítőjét.

## Bizalmi modell

A fingerprint nem titok, nyilvános metaadat. A bizonyíték az, hogy a **proxy
ellenőrizte: a kliens a megfelelő magánkulcsot mutatta be**, majd **felülírta**
az azonosító fejléceket, és a TCP-társ szerepel a `MTLS_TRUSTED_PROXIES`
listán.

1. Az alkalmazás portját ne publikáljuk. Csak a proxy érje el.
2. A proxy **törölje / írja felül** a kliens által küldött fingerprint- és
   verify-fejléceket. A `proxy_set_header` / `header_up` a TLS-munkamenetből
   vegye az értéket, soha ne a `$http_x_ssl_client_fingerprint` mezőt.
3. A proxy címét allowlisteljük (`172.28.0.10/32` a példában), ne a teljes
   Docker-hidat. A közvetlenül csatlakozó, hamis fejlécű kliens elutasításra
   kerül.
4. Ismeretlen `MTLS_MODE`, hiányzó allowlist, hiányzó fingerprint-fejlécnév,
   sikertelen verify-fejléc vagy ellenőrizetlen tanúsítvány mind zárva marad.

Az `ssl_verify_client optional` (nginx), a Caddy `mode request` és a Traefik
`VerifyClientCertIfGiven` ugyanazon a hoston hagyja működni a vezérlőpultot és
az API-kulcsokat. Az `on` / `require_and_verify` / `RequireAndVerifyClientCert`
csak külön runtime-hostnéven legyen kötelező.

## Teszt-CA és klienstanúsítvány

```bash
./deploy/self-host/generate-test-certs.sh
```

A szkript a `deploy/self-host/certs/` könyvtárba ír (CA, szerver, kliens), és
kiírja a kliens SHA-256 fingerprintjét. Ezt a fingerprintet kell felvenni az
**API-kulcsok → Alkalmazások tanúsítványos hozzáférése** panelen. A magánkulcsot
soha ne töltsük fel.

Ugyanez openssl-lel:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 3650 -subj "/CN=AgentPlaybooks test CA"
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 3650 \
  -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n")
openssl req -newkey rsa:2048 -nodes -keyout client.key -out client.csr -subj "/CN=apb-secret-client"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out client.crt -days 3650 \
  -extfile <(printf "extendedKeyUsage=clientAuth\n")
openssl x509 -in client.crt -noout -fingerprint -sha256
```

Élesben a teszt-CA helyett a szervezet CA-ját használjuk.

## Docker Compose (nginx)

```bash
./deploy/self-host/generate-test-certs.sh
docker compose -f deploy/self-host/docker-compose.mtls.yml up --build
```

A példa az nginxt `172.28.0.10`, az alkalmazást `172.28.0.20` címre köti egy
belső hálózaton, csak a `8443:443` portot publikálja, és ezt állítja:

```bash
MTLS_MODE=proxy
MTLS_PROXY_FINGERPRINT_HEADER=X-SSL-Client-Fingerprint
MTLS_PROXY_VERIFY_HEADER=X-SSL-Client-Verify
MTLS_TRUSTED_PROXIES=172.28.0.10/32
```

Konfigok: `deploy/self-host/nginx/nginx.conf`, `caddy/Caddyfile`,
`traefik/traefik.yml`, `traefik/dynamic.yml`.

A runtime-végpont próbája (GUID és nevek cseréje után):

```bash
curl --cacert deploy/self-host/certs/ca.crt \
  --cert deploy/self-host/certs/client.crt \
  --key deploy/self-host/certs/client.key \
  --resolve localhost:8443:127.0.0.1 \
  -H "Content-Type: application/json" \
  -d '{"names":["DATABASE_URL"],"auth_mode":"mtls"}' \
  https://localhost:8443/api/playbooks/GUID/secrets/resolve
```

## nginx

```nginx
ssl_client_certificate /etc/nginx/certs/ca.crt;
ssl_verify_client optional;
ssl_verify_depth 2;

location / {
    proxy_pass http://app:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-SSL-Client-Verify $ssl_client_verify;
    proxy_set_header X-SSL-Client-Fingerprint $ssl_client_escaped_cert;
}
```

A `proxy_set_header` felülírja a bejövő fejlécet. Ne használjuk a
`$http_x_ssl_client_fingerprint` változót.

## Caddy

```caddy
example.org {
	tls /certs/server.crt /certs/server.key {
		client_auth {
			mode request
			trusted_ca_cert_file /certs/ca.crt
		}
	}
	reverse_proxy app:3000 {
		header_up -X-SSL-Client-Fingerprint
		header_up -X-SSL-Client-Verify
		header_up X-SSL-Client-Fingerprint {http.request.tls.client.fingerprint}
		header_up X-SSL-Client-Verify SUCCESS
	}
}
```

A Caddy fingerprint-helyettesítője eleve SHA-256 hex. Üres fingerprint (nincs
klienstanúsítvány) továbbra is zárva marad.

## Traefik

A Traefiknek nincs SHA-256 fingerprint-változója. Az ellenőrzött PEM-et kell
továbbítani, és a `MTLS_PROXY_FINGERPRINT_HEADER` értékét
`X-Forwarded-Tls-Client-Cert` mezőre állítani.

```yaml
tls:
  options:
    mtls:
      clientAuth:
        caFiles:
          - /certs/ca.crt
        clientAuthType: VerifyClientCertIfGiven

http:
  middlewares:
    pass-client-cert:
      passTLSClientCert:
        pem: true
    mtls-verify:
      headers:
        customRequestHeaders:
          X-SSL-Client-Verify: "SUCCESS"
```

```bash
MTLS_PROXY_FINGERPRINT_HEADER=X-Forwarded-Tls-Client-Cert
MTLS_PROXY_VERIFY_HEADER=X-SSL-Client-Verify
```

A `passTLSClientCert` felülírja az `X-Forwarded-Tls-Client-Cert` fejlécet. A
statikus `SUCCESS` verify-fejléc csak azért biztonságos, mert a Traefik már
alkalmazta a `clientAuth` beállítást; e nélkül nyitott relé lenne.

## Python-kliens

Az alkalmazás továbbra is TLS-en mutatja be a tanúsítványát a proxy felé:

```sh
export AGENTPLAYBOOKS_URL=https://secrets.example.org
export AGENTPLAYBOOKS_PLAYBOOK_GUID=YOUR_GUID
export AGENTPLAYBOOKS_CLIENT_CERT_FILE=/secure/apb-client.crt
export AGENTPLAYBOOKS_CLIENT_KEY_FILE=/secure/apb-client.key
export AGENTPLAYBOOKS_CA_BUNDLE=/secure/ca.crt
```

Lásd: [Python Secrets](./python-secrets.md) és a
[csomag README](https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/python-secrets).
