#!/bin/sh
# Régénère Essence.app/Contents/Resources/Essence.icns à partir de tools/make-icon.swift.
# Nécessite les Command Line Tools (swift, sips, iconutil).
set -e
dir=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

swift "$dir/tools/make-icon.swift" "$tmp/icon-1024.png"
mkdir "$tmp/Essence.iconset"
for sz in 16 32 128 256 512; do
  sips -z $sz $sz "$tmp/icon-1024.png" --out "$tmp/Essence.iconset/icon_${sz}x${sz}.png" >/dev/null
  sips -z $((sz * 2)) $((sz * 2)) "$tmp/icon-1024.png" --out "$tmp/Essence.iconset/icon_${sz}x${sz}@2x.png" >/dev/null
done
iconutil -c icns "$tmp/Essence.iconset" -o "$dir/Essence.app/Contents/Resources/Essence.icns"
touch "$dir/Essence.app" # force le Finder à relire l'icône
echo "Essence.icns régénérée"
