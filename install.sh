#!/usr/bin/env bash
# shellcheck disable=SC1112  # apostrophes typographiques voulues dans les messages
# Ma Bbox : installation du panel sur un Raspberry Pi, un PC Linux ou un Mac.
#
#   Depuis un clone du dépôt :  ./install.sh
#   En une ligne :              curl -fsSL https://raw.githubusercontent.com/Cremechocos/bbox-panel/main/install.sh | bash
#                               (dépôt privé : GITHUB_TOKEN=<jeton> devant « bash », ou « gh auth login » au préalable)
#
# Options :
#   --port <n>       port du panel (8484)
#   --remote <adresse[:port]>  joindre la Bbox par son accès distant (IP publique ou nom DynDNS, port 443 par défaut)
#   --dir <dossier>  dossier d'installation quand le script télécharge le panel (~/bbox-panel)
#   --version <vX>   version à télécharger (dernière par défaut)
#   --build          construit l'interface sur place au lieu de la télécharger
#   --no-service     installe sans service : à lancer soi-même avec « npm start »
#   --uninstall      arrête et retire le service (les données de ~/.bbox-panel sont conservées)
#
# Le script ne touche jamais à la Bbox : il vérifie seulement qu'elle répond.
# Relancer le script met à jour le panel (ou « git pull && ./install.sh » depuis un clone).
set -euo pipefail

REPO="${BBOX_PANEL_REPO:-Cremechocos/bbox-panel}"
PORT="${PORT:-8484}"
DATA_DIR="${DATA_DIR:-$HOME/.bbox-panel}"
INSTALL_DIR="${BBOX_PANEL_DIR:-$HOME/bbox-panel}"
LABEL="${BBOX_PANEL_LABEL:-fr.bbox-panel}"   # nom du service launchd (macOS)
UNIT="${BBOX_PANEL_UNIT:-bbox-panel}"        # nom du service systemd (Linux)
NODE_MAJOR=22
VERSION=""
BUILD=0
SERVICE=1
ACTION=install
REMOTE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --remote) REMOTE="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --build) BUILD=1; shift ;;
    --no-service) SERVICE=0; shift ;;
    --uninstall) ACTION=uninstall; shift ;;
    -h|--help) sed -n '3,20p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Option inconnue : $1 (voir --help)" >&2; exit 2 ;;
  esac
done

# ─── Affichage ───
if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else B=; D=; G=; Y=; R=; N=; fi
step() { printf '%s▸%s %s\n' "$B" "$N" "$*"; }
ok() { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
die() { printf '%s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"
case "$OS" in Linux|Darwin) ;; *) die "Système non pris en charge : $OS (Linux ou macOS)." ;; esac

SUDO=""
if [ "$(id -u)" -ne 0 ] && have sudo; then SUDO="sudo"; fi
as_root() { if [ -n "$SUDO" ]; then sudo "$@"; else "$@"; fi; }
has_systemd() { [ "$OS" = Linux ] && [ -d /run/systemd/system ] && have systemctl; }

# ─── Désinstallation ───
if [ "$ACTION" = uninstall ]; then
  step "Désinstallation du service"
  if [ "$OS" = Darwin ]; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
  elif has_systemd; then
    as_root systemctl disable --now "$UNIT" 2>/dev/null || true
    as_root rm -f "/etc/systemd/system/$UNIT.service"
    as_root systemctl daemon-reload
  fi
  ok "Service retiré. Données conservées dans $DATA_DIR (sessions, historique) : supprimez ce dossier pour tout effacer."
  exit 0
fi

printf '\n%sMa Bbox%s %s· installation du panel%s\n\n' "$B" "$N" "$D" "$N"
have curl || die "curl est nécessaire (sudo apt install curl)."
have tar || die "tar est nécessaire."

# ─── 1. La Bbox est-elle joignable ? (simple lecture, sans session) ───
step "Recherche de la Bbox"
if [ -n "$REMOTE" ]; then
  REMOTE_HOST="${REMOTE%%:*}"; REMOTE_PORT=443
  [ "$REMOTE_HOST" != "$REMOTE" ] && REMOTE_PORT="${REMOTE##*:}"
  if curl -fsk --max-time 6 -o /dev/null "https://$REMOTE_HOST:$REMOTE_PORT/api/v1/summary" 2>/dev/null; then
    ok "Bbox jointe en accès distant ($REMOTE_HOST:$REMOTE_PORT)"
  else
    warn "Accès distant injoignable ($REMOTE_HOST:$REMOTE_PORT) : est-il activé sur la Bbox (Accès & sécurité → Administration à distance) ? L'installation continue."
  fi
elif curl -fsk --max-time 4 -o /dev/null https://mabbox.bytel.fr/api/v1/summary 2>/dev/null; then
  ok "Bbox trouvée (mabbox.bytel.fr)"
elif curl -fsk --max-time 4 -o /dev/null https://192.168.1.254/api/v1/summary 2>/dev/null; then
  ok "Bbox trouvée (192.168.1.254)"
else
  warn "Bbox introuvable : cet appareil doit être sur le réseau de la Bbox (Ethernet de préférence). L'installation continue."
fi

# ─── 2. Node.js ≥ 20 ───
node_ok() { [ -x "$1" ] && [ "$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]; }
NODE=""
LOCAL_NODE="$DATA_DIR/node/bin/node"
step "Node.js"
if have node && node_ok "$(command -v node)"; then
  NODE="$(command -v node)"
  ok "Node $("$NODE" -v) ($NODE)"
elif node_ok "$LOCAL_NODE"; then
  NODE="$LOCAL_NODE"
  ok "Node $("$NODE" -v) (installé par le panel)"
else
  # binaire officiel de nodejs.org, vérifié par SHA-256, dans ~/.bbox-panel/node : ni sudo ni dépôt apt
  case "$(uname -m)" in
    x86_64|amd64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    armv7l|armv8l) ARCH=armv7l ;;
    armv6l) die "Raspberry Pi 1 / Zero (ARMv6) : Node.js 20+ n'existe plus pour ce processeur. Il faut un Pi 2 ou plus récent." ;;
    *) die "Processeur non pris en charge : $(uname -m)" ;;
  esac
  PLAT="$( [ "$OS" = Darwin ] && echo darwin || echo linux )"
  BASE="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  SUMS="$(curl -fsSL "$BASE/SHASUMS256.txt")" || die "Téléchargement de Node.js impossible (pas d'accès à nodejs.org ?)."
  FILE="$(printf '%s\n' "$SUMS" | awk -v p="-$PLAT-$ARCH.tar.gz" '$2 ~ p"$" {print $2; exit}')"
  SUM="$(printf '%s\n' "$SUMS" | awk -v f="$FILE" '$2 == f {print $1; exit}')"
  [ -n "$FILE" ] || die "Pas de Node.js $NODE_MAJOR pour $PLAT-$ARCH."
  printf '  %sTéléchargement de %s…%s\n' "$D" "$FILE" "$N"
  TMP="$(mktemp -d)"
  curl -fsSL "$BASE/$FILE" -o "$TMP/$FILE"
  if have sha256sum; then GOT="$(sha256sum "$TMP/$FILE" | awk '{print $1}')"; else GOT="$(shasum -a 256 "$TMP/$FILE" | awk '{print $1}')"; fi
  [ "$GOT" = "$SUM" ] || die "Somme de contrôle de Node.js incorrecte : téléchargement corrompu."
  mkdir -p "$DATA_DIR"
  rm -rf "$DATA_DIR/node"
  tar -xzf "$TMP/$FILE" -C "$TMP"
  mv "$TMP/${FILE%.tar.gz}" "$DATA_DIR/node"
  rm -rf "$TMP"
  NODE="$LOCAL_NODE"
  if ! "$NODE" -v >/dev/null 2>&1 && have apt-get; then
    # Node pour ARMv7 (Raspberry Pi OS 32 bits) a besoin de libatomic, absente de certaines images « Lite »
    printf '  %sInstallation de libatomic1 (apt)…%s\n' "$D" "$N"
    as_root apt-get install -y -qq libatomic1 >/dev/null 2>&1 \
      || { as_root apt-get update -qq >/dev/null 2>&1 && as_root apt-get install -y -qq libatomic1 >/dev/null 2>&1; } || true
  fi
  "$NODE" -v >/dev/null 2>&1 || die "Node.js ne démarre pas sur cet appareil : $("$NODE" -v 2>&1 | head -1)"
  ok "Node $("$NODE" -v) installé dans $DATA_DIR/node"
fi
NODE_BIN="$(dirname "$NODE")"
export PATH="$NODE_BIN:$PATH"

# ─── 3. Fichiers du panel ───
# Jeton GitHub pour un dépôt privé : GITHUB_TOKEN, ou celui de « gh » s'il est connecté
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [ -z "$TOKEN" ] && have gh; then TOKEN="$(gh auth token 2>/dev/null || true)"; fi

# Télécharge l'archive d'une version publiée (interface déjà construite) : $1 = tag ou vide (dernière), $2 = destination
fetch_release() {
  local tag="$1" out="$2" api url id
  # archive fournie (installation hors ligne, tests) : BBOX_PANEL_TARBALL=/chemin/bbox-panel.tar.gz
  if [ -n "${BBOX_PANEL_TARBALL:-}" ]; then cp "$BBOX_PANEL_TARBALL" "$out"; return; fi
  if [ -z "$TOKEN" ]; then
    if [ -n "$tag" ]; then url="https://github.com/$REPO/releases/download/$tag/bbox-panel.tar.gz"
    else url="https://github.com/$REPO/releases/latest/download/bbox-panel.tar.gz"; fi
    curl -fsSL "$url" -o "$out" 2>/dev/null
    return
  fi
  # dépôt privé : on passe par l'API avec le jeton
  if [ -n "$tag" ]; then api="https://api.github.com/repos/$REPO/releases/tags/$tag"; else api="https://api.github.com/repos/$REPO/releases/latest"; fi
  id="$(curl -fsSL -H "Authorization: Bearer $TOKEN" -H 'Accept: application/vnd.github+json' "$api" 2>/dev/null \
    | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=(JSON.parse(s).assets||[]).find(a=>a.name==="bbox-panel.tar.gz");process.stdout.write(a?String(a.id):"")}catch{}})')" || true
  [ -n "$id" ] || return 1
  curl -fsSL -H "Authorization: Bearer $TOKEN" -H 'Accept: application/octet-stream' "https://api.github.com/repos/$REPO/releases/assets/$id" -o "$out"
}

build_web() {
  have npm || die "npm est introuvable pour construire l'interface."
  printf '  %sConstruction de l’interface (1 à 3 min sur un Raspberry Pi)…%s\n' "$D" "$N"
  (cd "$APP/web" && npm ci --no-audit --no-fund --loglevel=error && npx --no-install vite build --logLevel warn) \
    || die "La construction de l'interface a échoué. Sur un petit Raspberry Pi, préférez une version publiée (sans --build)."
}

step "Panel"
SELF="${BASH_SOURCE[0]:-}"
if [ -n "$SELF" ] && [ -f "$(dirname "$SELF")/server/index.mjs" ]; then
  # lancé depuis un clone : on installe sur place
  APP="$(cd "$(dirname "$SELF")" && pwd)"
  VER="v$("$NODE" -p 'require("./package.json").version' 2>/dev/null || echo 0)"
  # identifiant de la source : commit git si possible, sinon version
  SRC="$VER"
  if have git && [ -d "$APP/.git" ]; then SRC="$(git -C "$APP" rev-parse --short HEAD 2>/dev/null || echo "$VER")"; fi
  ok "Clone du dépôt : $APP ($VER, $SRC)"
  MARK="$APP/web/dist/.source"
  if [ "$BUILD" = 0 ] && [ -f "$APP/web/dist/index.html" ] && [ ! -f "$MARK" ]; then
    ok "Interface déjà construite (web/dist) : conservée. --build pour la reconstruire."
  elif [ "$BUILD" = 1 ] || [ ! -f "$APP/web/dist/index.html" ] || [ "$(cat "$MARK")" != "$SRC" ]; then
    # le clone est-il exactement sur une version publiée ? Alors son interface est téléchargeable, sinon on la construit
    TAGGED=1
    if have git && [ -d "$APP/.git" ]; then git -C "$APP" describe --tags --exact-match HEAD >/dev/null 2>&1 || TAGGED=0; fi
    TMP="$(mktemp -d)"
    if [ "$BUILD" = 0 ] && [ "$TAGGED" = 1 ] && fetch_release "$VER" "$TMP/p.tgz" && tar -xzf "$TMP/p.tgz" -C "$TMP" && [ -f "$TMP/bbox-panel/web/dist/index.html" ]; then
      rm -rf "$APP/web/dist"; mv "$TMP/bbox-panel/web/dist" "$APP/web/dist"
      ok "Interface $VER téléchargée"
    else
      build_web
      ok "Interface construite"
    fi
    rm -rf "$TMP"
    printf '%s\n' "$SRC" > "$MARK"
  else
    ok "Interface à jour"
  fi
else
  # lancé par « curl … | bash » : on télécharge la version publiée
  APP="$INSTALL_DIR"
  TMP="$(mktemp -d)"
  fetch_release "$VERSION" "$TMP/p.tgz" || die "Téléchargement impossible depuis github.com/$REPO. Dépôt privé ? Ajoutez GITHUB_TOKEN=<jeton> ou connectez « gh » (gh auth login)."
  tar -xzf "$TMP/p.tgz" -C "$TMP"
  [ -f "$TMP/bbox-panel/server/index.mjs" ] || die "Archive inattendue."
  mkdir -p "$APP"
  # remplace le code, garde ce qui n'en fait pas partie
  rm -rf "$APP/server" "$APP/web" "$APP/public"
  cp -R "$TMP/bbox-panel/." "$APP/"
  rm -rf "$TMP"
  ok "Panel $("$NODE" -p "require('$APP/package.json').version") installé dans $APP"
fi
mkdir -p "$DATA_DIR"
chmod 700 "$DATA_DIR"

# ─── 4. Service ───
lan_ip() {
  if [ "$OS" = Darwin ]; then ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost
  else hostname -I 2>/dev/null | awk '{print $1}' | grep . || echo localhost; fi
}
step "Service"
if [ "$SERVICE" = 0 ]; then
  warn "Sans service : lancez « cd $APP && PORT=$PORT${REMOTE:+ BBOX_IP=$REMOTE_HOST BBOX_PORT=$REMOTE_PORT} $NODE server/index.mjs »."
elif [ "$OS" = Darwin ]; then
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$APP/server/index.mjs</string></array>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>EnvironmentVariables</key><dict>
    <key>PORT</key><string>$PORT</string>
    <key>HOST</key><string>0.0.0.0</string>
    <key>DATA_DIR</key><string>$DATA_DIR</string>
    <key>NODE_ENV</key><string>production</string>${REMOTE:+
    <key>BBOX_IP</key><string>$REMOTE_HOST</string>
    <key>BBOX_PORT</key><string>$REMOTE_PORT</string>}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DATA_DIR/panel.log</string>
  <key>StandardErrorPath</key><string>$DATA_DIR/panel.log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  ok "Service launchd « $LABEL » (démarre avec la session, redémarre s'il s'arrête)"
elif has_systemd; then
  [ "$(id -u)" -eq 0 ] || [ -n "$SUDO" ] || die "sudo est nécessaire pour créer le service systemd (ou utilisez --no-service)."
  RUN_USER="$(id -un)"
  as_root tee "/etc/systemd/system/$UNIT.service" >/dev/null <<EOF
[Unit]
Description=Ma Bbox (panel pour Bbox Bouygues Telecom)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP
Environment=PORT=$PORT HOST=0.0.0.0 DATA_DIR=$DATA_DIR NODE_ENV=production${REMOTE:+ BBOX_IP=$REMOTE_HOST BBOX_PORT=$REMOTE_PORT}
ExecStart=$NODE $APP/server/index.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
  as_root systemctl daemon-reload
  as_root systemctl enable "$UNIT" >/dev/null 2>&1
  as_root systemctl restart "$UNIT"
  ok "Service systemd « $UNIT » (démarre avec l'appareil, redémarre s'il s'arrête)"
else
  SERVICE=0
  warn "systemd absent : lancez « cd $APP && PORT=$PORT $NODE server/index.mjs » (ou utilisez Docker)."
fi

# ─── 5. Vérification ───
if [ "$SERVICE" = 1 ]; then
  step "Démarrage"
  up=0
  for _ in $(seq 1 30); do
    if curl -fs --max-time 2 -o /dev/null "http://127.0.0.1:$PORT/panel/health"; then up=1; break; fi
    sleep 1
  done
  if [ "$up" = 1 ]; then ok "Le panel répond sur le port $PORT"
  elif [ "$OS" = Darwin ]; then die "Le panel ne répond pas : voir $DATA_DIR/panel.log"
  else die "Le panel ne répond pas : voir « journalctl -u $UNIT -n 50 »"; fi
fi

IP="$(lan_ip)"
printf '\n%s✓ Ma Bbox est installé.%s\n\n' "$G$B" "$N"
printf '  Ouvrir         %shttp://%s:%s%s  (mot de passe administrateur de la Bbox)\n' "$B" "$IP" "$PORT" "$N"
printf '  Sur iPhone     Safari → Partager → Sur l’écran d’accueil\n'
if [ -d "$APP/.git" ]; then printf '  Mettre à jour  cd %s && git pull && ./install.sh\n' "$APP"
else printf '  Mettre à jour  relancer ce script\n'; fi
printf '  Désinstaller   %s --uninstall\n' "$( [ -f "$APP/install.sh" ] && echo "$APP/install.sh" || echo 'install.sh')"
if [ "$SERVICE" = 1 ]; then
  if [ "$OS" = Linux ]; then printf '  Journal        journalctl -u %s -f\n' "$UNIT"; else printf '  Journal        %s/panel.log\n' "$DATA_DIR"; fi
fi
printf '\n'
