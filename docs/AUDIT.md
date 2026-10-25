# Audit : interface d'administration Bbox (mabbox.bytel.fr)

*Réalisé le 24/10/2026 sur une Bbox Wi-Fi 7 (Sagemcom F@st5696b, firmware 25.5.76). Lecture seule, depuis le réseau local, avec la session de son propriétaire.*

| | |
|---|---|
| Modèle | **Sagemcom F@st5696b** (Bbox Wi-Fi 7 : 2,4 / 5 / 6 GHz + MLO) |
| Firmware | 25.5.76 (5 juin 2026), 6 démarrages, mise en service le 21/10/2026 |
| Accès | Fibre GPON (classe B+), IPv4 publique **non partagée** (ni CGNAT ni MAP-T) + IPv6 /60 |
| Secours | Internet de secours 4G activable (`isCellularEnable: 1`) |
| Téléphonie | 1 ligne active, combiné branché |

---

## 1. En bref

1. **Toute l'interface repose sur une API REST locale** (`https://mabbox.bytel.fr/api/v1/…`), joignable seulement depuis le réseau de la maison. J'y ai vérifié **86 points d'accès qui répondent en lecture**, et recensé dans le code une centaine d'actions d'écriture.
2. **L'interface officielle n'en montre qu'une partie.** Elle mélange une application React récente et une douzaine d'anciennes pages jQuery chargées en iframe (« Réglages avancés »). Plusieurs fonctions de l'API n'ont aucun bouton dans la nouvelle interface (voir §4).
3. **34 points d'accès sont lisibles sans mot de passe** par n'importe quel appareil du réseau local : liste des appareils avec leurs adresses MAC, règles NAT, configuration DHCP, puissance optique de la fibre, historique CPU, etc. (voir §6).
4. **Pour écrire**, il faut un cookie de session `BBOX_ID` et, pour les `POST` uniquement, un jeton `btoken` à usage court (~3 min).
5. **La Bbox se protège** : verrouillage après plusieurs mauvais mots de passe (HTTP 429), qu'aggrave chaque nouvel échec. Elle refuse aussi les connexions quand on l'interroge trop vite. Son adresse IPv6 sur le réseau local répond par intermittence : seul l'IPv4 est fiable.

---

## 2. Architecture technique observée

```
Navigateur ──HTTPS──▶ mabbox.bytel.fr (= 192.168.1.254, résolu uniquement par le DNS de la Bbox)
                      ├─ /            → SPA React (static/js/main.c82b39eb.js, ~1,3 Mo)
                      ├─ /*.html      → pages legacy jQuery (iframe), protégées par session
                      ├─ /js/*.js     → scripts legacy, publics (dont bbox-merge.js = bibliothèque API complète)
                      ├─ /fonts/*     → police Bouygues Read (publique)
                      └─ /api/v1/*    → API REST JSON (Lighttpd)
```

- **Certificat TLS** : valide, signé par DigiCert pour `mabbox.bytel.fr`. Le nom ne se résout pas sur un DNS public (testé avec 1.1.1.1).
- **CORS** : la Bbox répond à `OPTIONS` sans en-tête `Access-Control-Allow-Origin`. Un site ou une webapp hébergée ailleurs ne peut donc pas appeler l'API directement. C'est pourquoi le panel passe par un **serveur relais local**.
- **Format** : réponses JSON, presque toujours sous la forme d'un tableau à un élément (`[{"wireless":{…}}]`). Les textes accentués sont **doublement encodés en UTF-8** (`bloquÃ©s`) ; l'IHM legacy les corrige avec `decodeURIComponent(escape(s))`.
- **Écritures** : corps `application/x-www-form-urlencoded`, avec le même contenu recopié dans un en-tête `ForceData` (comme le font les deux IHM officielles).
- **Alias DNS de la Bbox** : `mabbox.bytel.fr`, `gestionbbox.lan`, `bbox.lan`, `localdevice.abrstream.tech`.

### Authentification

| Étape | Requête | Détail |
|---|---|---|
| Connexion | `POST /api/v1/login` `password=…&remember=1` | Renvoie le cookie `BBOX_ID`. Pas de `btoken`. |
| Maintien | `PUT /api/v1/login` (corps vide) | Fait par l'IHM avant chaque série d'actions (`refreshLogin`). |
| Jeton d'écriture | `GET /api/v1/device/token` | `{"token":…,"expires":"…+3 min"}` |
| Écriture `POST` | `POST /api/v1/<ressource>?btoken=<jeton>` | Création, actions (reboot, WPS, ping…). |
| Écriture `PUT`/`DELETE` | sans `btoken` | Modification et suppression. Protégées par le cookie et par l'absence de CORS. |
| Déconnexion | `POST /api/v1/logout` | |
| Verrouillage | HTTP 429 + `exception.errors[0].reason` | Chaque nouvel essai prolonge le blocage. |

---

## 3. Ce que permet l'interface officielle

| Menu officiel | Contenu | Technologie |
|---|---|---|
| Accueil | État Internet, Wi-Fi, appareils, téléphonie | React |
| Wi-Fi | SSID/mot de passe (unifié ou par bande), Wi-Fi 7 « -Plus », invité, secondaire, WPS, réglages avancés (canal, largeur, mode éco), pauses Wi-Fi | React |
| Appareils | Liste, historique, ping, scan de ports, réveil (WoL), « rendre statique », retrait | React |
| Contrôle d'accès | Pauses Internet par appareil, plages horaires, veille Bbox, « ne pas déranger » | React |
| Diagnostic | Voisinage Wi-Fi (2,4/5/6 GHz), coupure temporaire Wi-Fi, diagnostic Internet, DNS, IPTV, tests de ligne, journal, speed test, analyse du trafic | React + legacy |
| Réglages avancés | Pare-feu v4/v6, niveau de sécurité IPv6, NAT/PAT, DMZ, UPnP, DHCP (plage, IP fixes, options), DHCPv6, DynDNS, accès à distance, WoL distant, mode jeu, ping responder, sauvegarde, notifications, USB, CPL | **legacy en iframe** |
| Ma Bbox | Informations, écran, énergie, redémarrage | React |

---

## 4. Ce qui est caché ou non exposé

### 4.1 Pages qui existent sans être dans les menus
Pages servies par la Bbox, accessibles en tapant l'URL : `/sessions.html` (analyse du trafic par appareil), `/neighborhood.html`, `/voiptest.html`, `/diag-dns.html`, `/diag-tv.html`, `/log.html`, `/gamer.html`, `/mac-filter.html`, `/lost-password.html` (publique), `/eco` (« Mon empreinte Bbox »).

### 4.2 Fonctions de l'API sans aucun bouton dans la nouvelle interface
Sources : la bibliothèque `Bbox.createApi` de `/js/bbox-merge.js` et le bundle React. Cochés = vérifiés en lecture sur ta Bbox.

| Fonction | Point d'accès | Statut sur ta Bbox |
|---|---|---|
| **Sauvegardes de configuration nommées** (créer, restaurer, renommer, supprimer) | `configs` | ✅ GET répond (liste vide). Distinct de la sauvegarde cloud `usersave`. |
| **Revenir à l'ancienne interface** | `PUT device/newihm newihm=0` | Écriture seule |
| **Appeler depuis le navigateur** (le téléphone fixe sonne puis compose) | `PUT voip/dial line=1&number=…` | Écriture seule |
| **Statistiques DNS** de la Bbox (305 080 requêtes, temps moyen 8,6 ms) | `dns/stats` | ✅ |
| **Sessions IP par appareil** (conntrack, seuil d'alerte à 30 000) | `wan/diags/sessions` | ✅ |
| **Paramètres du module fibre** (Rx −17,2 dBm, Tx, température, n° de série ONT) | `wan/sff` | ✅ public |
| **Profils de provisionnement** (`option1_tripleplay`, TR-069) | `wan/autowan` | ✅ |
| **Historiques sur 15 min** (CPU, température, conso électrique) | `graphs/device/*` | ✅ public |
| **Changer l'IP de la Bbox** (avec simulation `validate=1`) | `PUT lan` | Écriture seule |
| **Options DHCP avancées** (54 types RFC 2132) et options décodeur TV | `dhcp/options`, `dhcp/stb/options` | ✅ |
| **Notifications e-mail** : 52 événements, contacts, envoi de test | `notification/*` | ✅ |
| **Orientation de l'écran** et **luminosité du répéteur** | `PUT device/display`, `device/extender/display` | Écriture seule |
| **Optimisation et identification des appareils** | `PUT device/optimization`, `device/identification` | Écriture seule |
| **Déblocage temporaire** d'un appareil en contrôle parental | `POST parentalcontrol/unblock` | Écriture seule |
| **Vider le journal** | `DELETE device/log` | Écriture seule |
| **Éjecter la clé 4G** | `PUT wan/backup action=eject` | ✅ lecture |
| **Changement de mot de passe** par l'API | `POST change-password` | Écriture seule |
| Messagerie vocale, renvoi d'appel, hotspot, `upnp/av`, `wan/sfp`, `wan/summary` | | ❌ 404 sur ce modèle |

### 4.3 Indicateurs de fonctionnalités (classes CSS du `<body>`)
`feat-5g feat-new-5g feat-ipv6 feat-diag-tcp feat-wifi-secured feat-sff feat-edge feat-wifiguest feat-wifi-temp-dis feat-wifi5auto feat-sao-usb feat-hibernate feat-indication-passphrase` · désactivés : `no-feat-6g no-feat-usb3 no-feat-sao-wifi no-feat-luminosity`.
Remarque : `no-feat-6g` est affiché alors que la radio 6 GHz est active (`wireless/6`, 320 MHz). C'est un indicateur hérité, sans rapport avec le matériel.

### 4.4 Services Bouygues externes appelés par l'IHM
`webiad.bouyguesbox.fr/diag/{country,resolv,oui}` (géolocalisation et fabricant des sessions), `/rn/` (notes de version), `/epg/` (programme TV), `secapp_threats.json` (cybersécurité, indisponible ici).

---

## 5. Catalogue de l'API (`/api/v1/…`)

Légende : **P** = public (sans mot de passe, depuis le LAN) · **S** = session nécessaire · **W** = écriture seule (GET → 404).

| Domaine | Point d'accès | Accès | Contenu | Écritures |
|---|---|---|---|---|
| Système | `device` | P | Modèle, firmware, uptime, démarrages, écran | — |
| | `device/summary` | S | + numéro de série | — |
| | `device/cpu`, `device/mem` | P | Temps CPU, température (52,7 °C), RAM 1,8 Go | — |
| | `device/led` | P | LED, ports Ethernet 1-5, écran | — |
| | `device/display` | W | | `PUT luminosity` (0-4), `orientation` |
| | `device/log` | S | Journal (connexions, appareils UP/DOWN…) | `DELETE` |
| | `device/token` | S | Jeton `btoken` | — |
| | `device/reboot` | W | | `POST` |
| | `device/factory` | W | | `POST` (bloqué par le panel) |
| | `device/usb`, `usb/storage`, `device/printer` | P/S | USB, fichiers, imprimantes | `PUT device/usb/{id}`, `/samba`, `/dlna`, `/printer` |
| | `graphs/device/{cpu,temp,power/week}` | P | Séries temporelles | — |
| | `usersave` | P | Sauvegarde cloud (dernière : 21/10 15:56) | `POST restore=1`, `authorized` |
| | `configs` | S | Sauvegardes nommées | `POST`, `POST configs/{id} restore=1`, `PUT`, `DELETE` |
| | `notification`, `/alerts`, `/contacts`, `/events` | S | Alertes e-mail | `PUT`, `POST/PUT/DELETE notification/{alert,contact}`, `POST notification/test` |
| | `alerts` | P | Alertes en cours | `DELETE alerts/{id}` |
| | `summary`, `services` | P (partiel) | Synthèse et état des services | — |
| Internet | `wan/ip`, `wan/ip/stats` | P | IP v4/v6, DNS, préfixe, débit temps réel (contrat 8 Gb/s) | — |
| | `wan/ftth/stats`, `wan/sff` | P | Lien 1000baseT, GPON, puissances optiques | — |
| | `wan/autowan` | S | Profils de provisionnement | — |
| | `wan/backup` | S | 4G de secours | `PUT action=eject` |
| | `wan/diags`, `wan/diags/sessions` | P/S | Tests DNS/ping/HTTP, sessions IP | `POST action=start\|reset` |
| | `dns/stats` | S | Statistiques DNS | — |
| | `speedtest`, `speedtest/info` | S | Débit mesuré par la Bbox + historique | `POST mode=downlink\|uplink` |
| Réseau local | `lan/ip`, `lan/stats` | P | 192.168.1.254/24, IPv6, alias, ports | `PUT lan ipaddress[,validate=1]` |
| | `dhcp` | P | Plage .1–.200, bail 24 h | `PUT enable,minaddress,maxaddress,leasetime` |
| | `dhcp/clients` | P | IP fixes | `POST`, `PUT/DELETE dhcp/clients/{id}` |
| | `dhcp/options`, `dhcp6/options`, `dhcp6/prefixdelegation` | P | Options DHCP v4/v6, délégation | `POST/PUT/DELETE …/{id}`, `PUT dhcp6 enable` |
| Appareils | `hosts` | S | 20 appareils : lien, bande, RSSI, débit, IPv6, type, contrôle parental | `PUT hosts/{id}`, `DELETE`, `POST action=ping\|scan\|wakeup` |
| | `hosts/lite`, `hosts/me` | **P** | Nom, **MAC**, IP, lien | — |
| | `untouchable/hosts/{id}` | W | | `PUT enable` (fige la bande) |
| | `typenames`, `cpl` | S/P | Types d'appareils, CPL | `PUT cpl force=1` |
| Wi-Fi | `wireless` | S | Radios, tous les SSID **et leurs mots de passe en clair**, capacités | `PUT radio.enable`, `wps.enable` |
| | `wireless/{24,5,6}` | S | Réglages par bande, puce Broadcom 6726 | `PUT ssid,passphrase,security,encryption,hidden,radio,channel,htbw,ecoMode,unified` |
| | `wireless/mlo` | S | Réseau `-Plus` (Wi-Fi 7) | `PUT` |
| | `wireless/guest`, `/guestenable` | S | Invité | `PUT ssid,passphrase` · `PUT enable` |
| | `wireless/secondary/{24,5}`, `/secondaryenable`, `/compatibility` | W | Wi-Fi secondaire | `PUT` |
| | `wireless/{24,5,6}/stats`, `/neighborhood` | S | Compteurs, réseaux voisins | `PUT …/neighborhood` (scan) |
| | `wireless/wps` | P | État WPS | `POST` (appairage), `DELETE` |
| | `wireless/acl` | S | Filtrage MAC | `PUT enable`, `POST/PUT/DELETE acl/rules` |
| | `wireless/scheduler` | S | Pauses Wi-Fi | `PUT enable`, `POST/PUT/DELETE scheduler/rule` |
| | `wireless/deactivation` | S | Coupure temporaire 5/6 GHz (300 s) | `PUT` / `PUT duration=0` |
| | `wireless/repeater` | S | Répéteurs et décodeurs appairés | — |
| Accès & sécurité | `nat/rules` | **P** | Redirections de ports | `PUT enable`, `POST`, `PUT/DELETE nat/rules/{id}` |
| | `nat/dmz` | **P** | DMZ | `PUT enable,ipaddress,dnsprotect` |
| | `upnp/igd`, `upnp/igd/rules` | P | UPnP et ports ouverts par les appareils | `PUT enable` |
| | `firewall`, `firewall/rules` | S | Pare-feu v4 (règle par défaut : ports 25 et 445 bloqués) | `PUT enable`, `POST`, `PUT/DELETE rules/{id}` |
| | `firewallv6/rules`, `/level` | S | Pare-feu v6, niveau « Normal » | `POST/PUT`, `PUT level` |
| | `firewall/pingresponder`, `/gamermode` | P/S | | `PUT enable[,ip,ipv6]` |
| | `dyndns` | S | 6 fournisseurs (dyn, no-ip, …) | `PUT enable`, `POST/PUT/DELETE dyndns/{id}` |
| | `remote/admin` (lu via `services`) | W | Accès distant : désactivé, port 443, activable | `PUT enable,port,ip,ip6address,srcip6` |
| | `remote/proxywol` | S | WoL depuis Internet | `PUT enable,ip` |
| Contrôle | `parentalcontrol`, `/scheduler` | S | Politique par défaut, plages | `PUT enable,defaultpolicy`, `PUT parentalcontrol/hosts`, `POST/PUT/DELETE scheduler/rule`, `POST parentalcontrol/unblock` |
| | `hibernate/scheduler` | S | Veille programmée | `PUT enable`, `POST/PUT/DELETE scheduler/rule` |
| Téléphonie | `voip` | S | Ligne, numéro, état, appels manqués | `PUT voip/blockanon/{l} block`, `PUT voip/dial` |
| | `voip/fullcalllog/{l}` | S | Journal d'appels | `DELETE voip/calllog/{id}` |
| | `voip/diag` | S | Tests de ligne | `POST voip/ringtest/{l}`, `voip/echotest/{l}` |
| | `voip/scheduler`, `/number` | S | Ne pas déranger, numéros autorisés | `PUT`, `POST/DELETE number`, `POST/PUT/DELETE rule` |
| TV | `iptv`, `iptv/diags` | S | Flux, multicast, IGMP | `PUT iptv/diags check=igmp\|server` |
| Auth | `login`, `logout`, `password-recovery[/verify]`, `reset-password`, `change-password` | — | | voir §2 |

**Format des plages horaires** (Wi-Fi, Internet, téléphone, veille) : `POST …/scheduler/rule` avec `name`, `occurency=1,2,3,4,5` (jours, 0 = dimanche), `intervals=HH:MM,HH:MM` et `enable`.

---

## 6. Sécurité : constats

| # | Constat | Gravité | Recommandation |
|---|---|---|---|
| 1 | **34 points d'accès lisibles sans mot de passe depuis le LAN**, dont la liste des appareils (MAC, IP, nom), les règles NAT/DMZ, la configuration DHCP, l'état de la sauvegarde et les paramètres optiques. | Moyenne | Bouygues ne permet pas de le modifier. Garder le Wi-Fi invité pour les appareils qui ne sont pas de confiance, et ne pas utiliser le Wi-Fi secondaire en WPA/WPA2. |
| 2 | `GET /wireless` et `/wireless/guest` renvoient **tous les mots de passe Wi-Fi en clair** à toute session admin. | Faible (session requise) | Le panel les masque par défaut. |
| 3 | Anti-bruteforce présent (HTTP 429 avec allongement), mais **pas de 2FA**. Le mot de passe admin est le seul rempart. | Moyenne si l'accès distant est activé | Mot de passe long ; en accès distant, restreindre l'IP source (`remote/admin ip=`). |
| 4 | CSRF : `POST` protégé par `btoken`. `PUT`/`DELETE` reposent sur l'absence de CORS (pas de requête « simple » possible). | Faible | RAS. |
| 5 | Sur l'accès distant, la Bbox refuse certaines fonctions (`api_remote_error` : « en accès distant, il n'est pas possible d'accéder à cette fonctionnalité »). | Info | À garder en tête pour le panel hors de chez toi. |
| 6 | La Bbox **ralentit ou coupe** les connexions après une rafale de requêtes (constaté vers 40 requêtes rapides, en majorité des 404). Son IPv6 LAN répond par intermittence. | Info | Le relais du panel limite à 3 requêtes simultanées, garde les réponses 1,5 s en cache et force l'IPv4. |
| 7 | Sauvegarde automatique de la configuration (y compris le mot de passe admin, selon le texte de l'IHM) **dans le réseau Bouygues** (`usersave`, toutes les heures). | Info | Désactivable via `POST usersave authorized=0`, si tu le souhaites. |

---

## 7. Ce que fait le panel « Ma Bbox »

- **Relais Node.js sans dépendance** (`server/`) : sert la webapp, relaie `/api/v1/*` vers la Bbox avec la session de l'utilisateur, ajoute le `btoken` aux `POST`, envoie l'en-tête `ForceData`, maintient la session et protège contre le CSRF. Il se limite lui-même pour éviter de déclencher le verrouillage de la Bbox. **La réinitialisation usine est volontairement bloquée.**
- **Webapp responsive installable sur iPhone** (manifest, icônes, mode plein écran, zones sûres), qui reprend l'identité visuelle Bbox modernisée.
- Couvre les domaines du §5, y compris les fonctions cachées du §4.2 lorsqu'elles sont utiles et sûres.

## 8. Écritures vérifiées sur la Bbox (24/10/2026)

Toutes réversibles, état initial restauré après chaque test :

| Action | Requête | Résultat |
|---|---|---|
| Luminosité de l'écran | `PUT device/display luminosity` | 2 → 3 → 2 ✅ |
| Redirection de port (désactivée) | `POST nat/rules`, `PUT nat/rules/{id}`, `DELETE` | créée, modifiée, supprimée ✅ (aussi via l'interface du panel) |
| Plage Wi-Fi | `POST wireless/scheduler/rule`, `PUT …/rule/{id}`, `DELETE` | ✅ Activer une règle active aussi la programmation globale |
| Règle pare-feu (désactivée) | `POST firewall/rules`, `DELETE` | ✅ |
| Bail DHCP fixe | `POST dhcp/clients`, `PUT`, `DELETE` | ✅ |
| Wi-Fi invité | `PUT wireless/guestenable enable` | 0 → 1 → 0 ✅, sans coupure du réseau principal |
| Pauses Internet d'un appareil | `PUT parentalcontrol/hosts` | ✅ |
| Ping / analyse de ports | `POST hosts/{id} action=ping\|scan` | ✅ (le `POST ping` répond parfois par une coupure de connexion, le test tourne quand même) |

### Formats de lecture constatés
- Plages horaires : `savedRules[] = {id, enable, name, intervals:"HH:MM,HH:MM", occurency}` (`occurency` est un nombre si un seul jour).
- Ping : `hosts/{id}.ping = {min, max, average, success, tries, status, results[]}`, durées en **microsecondes**.
- Consommation : `graphs/device/power/week` en **milliwatts** ; température en millidegrés.
- Compteurs : `wan/ip/stats` et `lan/stats` rafraîchis toutes les ~20 à 40 s ; `wireless/{24,5,6}/stats` toutes les 2 s, **sans** le trafic du réseau Wi-Fi 7 (MLO).
