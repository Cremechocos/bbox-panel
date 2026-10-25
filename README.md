# Ma Bbox — panel moderne pour Bbox Bouygues Telecom

Remplace l’interface `mabbox.bytel.fr` par une webapp claire, animée et installable sur iPhone.
Testé sur une **Bbox Wi-Fi 7 (Sagemcom F@st5696b, firmware 25.5.76)**.

- **Relais Node.js sans dépendance** (`server/`) : sert la webapp et relaie `/api/v1/*` vers la Bbox avec votre session (l’API de la Bbox n’autorise pas les appels venant d’un autre site).
- **Webapp** (`web/`) : React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix) + Motion, construite par Vite dans `web/dist`. Graphiques SVG maison, temps réel par SSE.
  Sans `web/dist`, le relais sert l’ancienne interface Preact (`public/`) : supprimer `web/dist` suffit pour revenir en arrière.
- **Audit de l’API** : [`docs/AUDIT.md`](docs/AUDIT.md).

## Installer

Le panel tourne sur n’importe quel appareil **branché au réseau de la Bbox** et allumé en permanence : Raspberry Pi (2 ou plus récent, Raspberry Pi OS 32 ou 64 bits), PC Linux, Mac, NAS avec Docker. Un appareil **en Ethernet** donne les mesures de latence les plus justes.

### Raspberry Pi, Linux ou Mac : une commande

```sh
git clone https://github.com/Cremechocos/bbox-panel.git
cd bbox-panel && ./install.sh
```

Le script :
1. vérifie que la Bbox répond (simple lecture, il ne la modifie jamais) ;
2. installe Node.js 22 dans `~/.bbox-panel/node` s’il manque : binaire officiel de nodejs.org, vérifié par SHA-256, sans sudo ni dépôt apt ;
3. récupère l’interface déjà construite de la version publiée correspondante, ou la construit sur place (1 à 3 min sur un Pi) ;
4. crée le service : **systemd** sous Linux (`bbox-panel`, démarre avec l’appareil, redémarre s’il s’arrête), **launchd** sur Mac ;
5. affiche l’adresse à ouvrir, par exemple `http://192.168.1.42:8484`.

**Sans clone** : `curl -fsSL https://raw.githubusercontent.com/Cremechocos/bbox-panel/main/install.sh | bash`. Le panel est alors installé dans `~/bbox-panel`.

| | |
|---|---|
| Mettre à jour | `cd bbox-panel && git pull && ./install.sh` |
| Désinstaller | `./install.sh --uninstall` (les données de `~/.bbox-panel` sont conservées) |
| Journal | `journalctl -u bbox-panel -f` (Linux) · `~/.bbox-panel/panel.log` (Mac) |
| Options | `--port 8080` · `--build` (reconstruire l’interface) · `--no-service` · `--help` |

Ensuite, ouvrez l’adresse affichée et connectez-vous avec le mot de passe administrateur de la Bbox. Le mot de passe n’est jamais stocké : seul le cookie de session de la Bbox l’est, dans `~/.bbox-panel/sessions.json` (droits 600).

### Sur iPhone
Safari → `http://<ip-de-l’appareil>:8484` → **Partager** → **Sur l’écran d’accueil**. L’app s’ouvre en plein écran avec l’icône Bouygues Telecom.

### Docker (NAS, serveur)
```sh
docker compose up -d           # construit l’image ; volume persistant pour les sessions
```
Chaque version publiée produit aussi une image `ghcr.io/cremechocos/bbox-panel` pour amd64, arm64 et arm/v7 (Raspberry Pi). Pour l’utiliser, remplacez `build: .` par `image: ghcr.io/cremechocos/bbox-panel:latest` dans `docker-compose.yml`.
Le conteneur doit être sur le réseau de la Bbox. Sous Linux, `network_mode: host` donne des latences plus justes. Si `mabbox.bytel.fr` ne se résout pas, le panel utilise `BBOX_FALLBACK_IP` (192.168.1.254).

### Publier une version
```sh
# après avoir changé "version" dans package.json et web/package.json
git tag v3.2.0 && git push --tags
```
GitHub Actions construit alors l’archive `bbox-panel.tar.gz` (interface comprise), qu’utilise `install.sh`, ainsi que l’image Docker multi-architecture.

### Développer
```sh
npm run build                                     # construit l’interface (web/dist)
npm start                                         # http://localhost:8484
PANEL_URL=http://127.0.0.1:8484 npm run dev:web   # Vite sur :5173, /api et /panel relayés vers le panel
```
Sur un Mac où le panel est installé en service : `npm run build`, puis `launchctl kickstart -k gui/$(id -u)/fr.bbox-panel`.

### Hors de chez vous
- **Joindre le panel à distance** : le plus simple et le plus sûr est [Tailscale](https://tailscale.com), installé sur l’appareil du panel et sur votre téléphone, qui ouvre ensuite `http://<nom-tailscale>:8484`. Autre possibilité : une redirection de port sur la Bbox (Accès & sécurité) avec DynDNS et HTTPS (`HTTPS_PORT`). Dans ce cas, n’exposez jamais le port HTTP.
- **Panel hors du réseau de la Bbox** (VPS, autre maison) : activez l’accès distant de la Bbox (Accès & sécurité → Administration à distance), puis `./install.sh --remote <ip-publique-ou-dyndns>[:port]`. Le relais vérifie toujours le certificat `mabbox.bytel.fr` de la Bbox. Certaines fonctions sont refusées par la Bbox à distance : le panel l’indique.
- **Apps iOS et Android** : elles se jumellent avec le QR code de **Ma Bbox → App mobile** ; sans relais joignable, elles parlent directement à la Bbox (voir [`docs/API-APPS.md`](docs/API-APPS.md)).

## Apparences
- **Bbox Clair** (par défaut) : cartes, couleurs Bouygues Telecom, police Bouygues Read, barre latérale ; claire par défaut, sombre au choix.
- **Noir Geist** (direction « Ligne ») : noir profond par défaut, minimal et dense, sans cartes ; barre latérale réductible aux icônes (touche `[`), barre de commande flottante, fiches et menus en verre dépoli ; clair au choix.
- Partout : palette de commandes `⌘K`, notifications en temps réel (arrivées, nouveaux appareils, coupures), mode mural, carte Wi-Fi imprimable.

## Ce que couvre le panel

| Écran | Contenu |
|---|---|
| Accueil | État Internet, débit (mesure Bbox), latence d’Internet et de vos services (YouTube, Netflix…), santé (CPU, température, mémoire), Wi-Fi, appareils, activité, fibre |
| Appareils | Recherche, filtres, fiche détaillée : renommer, pauses Internet, priorité Wi-Fi, bande figée, ping, analyse de ports, réveil (WoL), retrait |
| Wi-Fi | Réseaux principal / Wi-Fi 7 / invité avec QR codes, interrupteurs (Wi-Fi, unification, éco, WPS), canal et largeur par bande, appairage WPS, coupure 5/6 GHz, filtrage MAC, réseaux voisins |
| Pauses & contrôle | Plages Internet, Wi-Fi et veille Bbox, frise de la semaine, appareils concernés, déblocage +1 h |
| Réseau local | Ports Ethernet en direct, adresse de la Bbox, DHCP, baux fixes, IPv6, options DHCP |
| Accès & sécurité | Redirections de ports, DMZ, UPnP, pare-feu IPv4/IPv6, ping, mode jeu, administration à distance, réveil à distance, DynDNS |
| Téléphonie | Ligne, appels masqués, appel depuis le panel (fonction cachée), journal, tests sonnerie/écho, ne pas déranger |
| Diagnostic | Connexion, fibre (puissances optiques), tests DNS/ping/HTTP, test de débit Bbox, TV, secours 4G, sessions IP par appareil, DNS, journal |
| Ma Bbox | Matériel, santé en direct, historiques 24 h, consommation 7 jours, luminosité de l’écran, sauvegardes locales (fonction cachée) et cloud, alertes e-mail, USB, redémarrage |

## Sécurité
- Protection CSRF (en-tête `X-Panel` exigé sur toute écriture), cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` en HTTPS).
- Limitation des tentatives de connexion côté relais, en plus du verrouillage de la Bbox.
- **Réinitialisation usine bloquée** par le relais. Les actions qui coupent Internet ou le Wi-Fi demandent confirmation.
- HTTPS optionnel : `HTTPS_PORT=8443` + `~/.bbox-panel/tls/cert.pem` et `key.pem`.

## Limites connues (firmware 25.5.76)
- La Bbox ne rafraîchit ses compteurs **WAN et LAN** que toutes les ~20 à 40 s : le graphique « Débit Internet » affiche ces mesures et indique leur âge. Les compteurs Wi-Fi par bande sont, eux, mis à jour toutes les 2 s.
- Le trafic du réseau **Wi-Fi 7 (MLO)** n’est pas détaillé par bande par la Bbox.
- **Latence** : l’API de la Bbox ne sait pinguer que les appareils du réseau local, et lancer son autotest horaire vers un serveur fixe de Bouygues. Le relais mesure donc la latence lui-même (`server/probes.mjs`) : il ouvre une connexion TCP vers chaque service, à travers la Bbox. Par défaut, il retire de chaque mesure le trajet entre l’appareil du relais et la Bbox, mesuré au même instant : on obtient la latence **depuis la Bbox**, qui recoupe le ping de son autotest. Ce réglage se désactive dans « Services mesurés ».
- Renommer un appareil crée une réservation DHCP (comme l’interface officielle).

## Autres modèles de Bbox
Le panel est testé sur la Bbox Wi-Fi 7. Sur un autre modèle, **Ma Bbox → Compatibilité → Générer le rapport** liste les fonctions absentes de votre Bbox (sans numéro de série, adresse MAC ni adresse IP) : joignez-le à une [issue « Compatibilité »](https://github.com/Cremechocos/bbox-panel/issues/new?template=compatibilite.yml).

Certaines fonctions dépendent du firmware : par exemple **« Appareil prioritaire »** n’existe que si la Bbox l’annonce (`preferredAvailable`). Le firmware 25.5.76 de la Bbox Wi-Fi 7 ne l’inclut pas : l’interface officielle masque alors le bouton, et le panel indique « Non proposé par votre Bbox ».

## Configuration (variables d’environnement)
`PORT` (8484) · `HOST` (0.0.0.0) · `HTTPS_PORT` · `BBOX_HOST` (mabbox.bytel.fr) · `BBOX_IP` (IP locale, ou IP publique / nom DynDNS pour l’accès distant) · `BBOX_PORT` (443) · `BBOX_FALLBACK_IP` (192.168.1.254) · `DATA_DIR` (~/.bbox-panel) · `SESSION_DAYS` (30) · `VERBOSE=1`

## Licence
[MIT](LICENSE). Projet indépendant, **non affilié à Bouygues Telecom**. « Bbox » et « Bouygues Telecom » sont des marques de Bouygues Telecom. La police Bouygues Read n’est pas redistribuée : le relais la lit sur votre propre Bbox.
