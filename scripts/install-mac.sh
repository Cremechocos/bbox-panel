#!/bin/sh
# Ancien point d'entrée : l'installation (macOS, Linux, Raspberry Pi) est faite par install.sh à la racine.
exec "$(cd "$(dirname "$0")/.." && pwd)/install.sh" "$@"
