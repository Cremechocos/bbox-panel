# Contrat des apps iOS et Android

Les apps natives (`ios/`, `android/`) fonctionnent en **mode hybride** :

| Mode | Quand | Fonctions |
|---|---|---|
| **Relais** | un relais `bbox-panel` répond (`GET /panel/info`) | tout : temps réel, historique, événements, minuteurs, latence par service |
| **Direct** | pas de relais joignable | fonctions de base, en parlant à l'API de la Bbox |

Ordre d'essai à l'ouverture : relais local → relais distant (s'il est configuré) → Bbox locale (`https://mabbox.bytel.fr`) → Bbox distante (accès distant). Les fonctions absentes du mode courant s'affichent « Nécessite le relais » ou « Indisponible à distance », jamais en erreur.

**Secrets** : le mot de passe de la Bbox n'est jamais stocké. On ne garde que le cookie de session (relais `bp_sid` ou Bbox), dans le Keychain (iOS) ou dans un stockage chiffré par Android Keystore.

## 1. Jumelage

Le panel web affiche dans **Ma Bbox → App mobile** un QR code au format :

```
bboxpanel://pair?url=<origine du relais, encodée>      ex. bboxpanel://pair?url=http%3A%2F%2F192.168.1.42%3A8484
```

L'app déclare le schéma `bboxpanel` (deep link). Elle valide l'URL, appelle `/panel/info`, puis demande le mot de passe de la Bbox.

## 2. Mode relais

Base : l'URL du relais. JSON en entrée et en sortie.

| Méthode et route | Rôle |
|---|---|
| `GET /panel/info` | **public**. `{ app: "bbox-panel", version, api: 1, remote, features: [...] }`. `app` sert à reconnaître un relais ; `remote: true` = le relais joint la Bbox par son accès distant. |
| `POST /panel/login` `{ password, remember: true }` | renvoie `Set-Cookie: bp_sid=…` (30 jours). Erreurs : `401 bad_password`, `429 local_throttle {retryIn}` / `bbox_locked`, `502 bbox_unreachable`. |
| `GET /panel/session` | `{ authenticated }` : vérifie aussi la session côté Bbox. |
| `POST /panel/logout` | ferme la session. |
| `GET /panel/live` | flux **SSE** : `event: snapshot` (état complet) à la connexion, puis `event: patch` `{ t, s: {clé: état}, p: {série: points} }` et `event: events` `{ events, unread }`. Battement `: ping` toutes les 20 s, `retry: 3000`. |
| `GET /panel/history?range=24h` · `GET /panel/usage?days=31` | historiques. |
| `GET /panel/events?since=&limit=` · `POST /panel/events/ack {ids \| all}` | journal d'événements. |
| `GET /panel/timers` · `POST /panel/pause` · `DELETE /panel/pause/{mac}` · `POST/DELETE /panel/guest` | minuteurs. |
| `GET /panel/compat` | rapport de compatibilité (modèle, firmware, routes absentes). |
| `GET\|PUT\|POST\|DELETE /api/v1/{route}` | relais vers la Bbox, en JSON (le relais convertit, ajoute le `btoken` et l'en-tête `ForceData`). |

Règles :
- **Toute requête autre que GET** porte l'en-tête `X-Panel: 1` (protection CSRF du relais). Sans lui : 403.
- `401 panel_auth_required` ou `bbox_auth_required` : session perdue → écran de connexion.
- `403 blocked_by_panel` : action volontairement refusée (remise à zéro usine).
- `403 bbox_remote_forbidden` : la Bbox refuse cette fonction en accès distant.
- Les réponses `/api/v1/*` sont brutes (voir § 4 pour leur décodage).

## 3. Mode direct (API de la Bbox)

Base : `https://mabbox.bytel.fr/api/v1` en local, `https://<IP publique ou DynDNS>:<port>/api/v1` à distance (port de **Accès & sécurité → Administration à distance**, 443 par défaut).

**TLS à distance** : la Bbox présente le certificat public (DigiCert) de `mabbox.bytel.fr`, même quand on la joint par son IP. On ne désactive jamais la vérification. On vérifie la chaîne normalement, mais contre le nom `mabbox.bytel.fr` au lieu de l'hôte composé (iOS : `SecPolicyCreateSSL(true, "mabbox.bytel.fr")` dans `urlSession(_:didReceive:)` ; Android : `HostnameVerifier` d'OkHttp qui vérifie `mabbox.bytel.fr`). Le relais fait de même (`server/bbox.mjs` : SNI `mabbox.bytel.fr`, connexion à `BBOX_IP:BBOX_PORT`). *À confirmer sur une Bbox dont l'accès distant est activé.*

Protocole (repris de l'IHM officielle, voir `server/bbox.mjs`) :
- En-têtes : `X-Requested-With: XMLHttpRequest`, `Origin` et `Referer` = `https://mabbox.bytel.fr`.
- **Connexion** : `POST /login`, corps `application/x-www-form-urlencoded` `password=…&remember=1`, avec le même corps répété dans l'en-tête `ForceData`. La session est dans les cookies `Set-Cookie` de la réponse. `429` = Bbox verrouillée après des échecs.
- **Maintien** : `PUT /login` (corps vide) toutes les 10 min d'activité.
- **Écritures** : corps form-urlencoded (booléens en `1`/`0`) + en-tête `ForceData` identique au corps. Les **POST** portent en plus `?btoken=<jeton>`, obtenu juste avant par `GET /device/token` → `[{device:{token}}]`. PUT et DELETE n'en ont pas besoin.
- **Cadence** : 3 requêtes simultanées au plus, sinon la Bbox ralentit ou coupe.
- **Accès distant** : `403` = fonction refusée à distance (`api_remote_error` de l'IHM). L'IHM officielle se considère « à distance » dès que l'hôte est une adresse IP.

## 4. Décodage des réponses de la Bbox

- Presque toujours **un tableau à un élément** : `[{"wireless":{…}}]` → déballer.
- Les textes accentués sont **doublement encodés en UTF-8** (`bloquÃ©s`). Si une chaîne contient `[Â-ô][\u0080-¿]`, la réinterpréter : octets Latin-1 → décodage UTF-8 (`web/src/lib/format.ts` → `fixText`).
- Erreurs : `{ exception: { domain, code, errors: [{ "name:"|"name", reason }] } }`. Attention, la clé est parfois `"name:"`, avec les deux-points. `reason: "Object does not exist"` = fonction absente du firmware.

## 5. Périmètre MVP des apps

| Écran | Routes Bbox | Relais seulement |
|---|---|---|
| Accueil | `summary`, `wan/ip`, `wan/ip/stats`, `device`, `device/cpu`, `device/mem` | débit et latence en direct (SSE) |
| Appareils | `hosts` · renommer = bail DHCP fixe `dhcp/clients` `{enable:1, hostname, ipaddress, macaddress}` (voir `renameDevice` dans `web/src/views/devices.tsx`) · `POST hosts/{id}` `action=wakeup` · `PUT parentalcontrol/hosts` · `POST hosts/prioritize/{id}` **si** `summary.preferredAvailable === 1`, appareil Wi-Fi, pas un répéteur | pauses minutées (`/panel/pause`) |
| Wi-Fi | `wireless` · `PUT wireless` `radio.enable` · `PUT wireless/guestenable` | invité minuté (`/panel/guest`) |
| Ma Bbox | `device` · `POST device/reboot` (avec confirmation) | événements, historique |
