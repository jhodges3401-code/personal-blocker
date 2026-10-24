#!/bin/bash
# Personal Blocker updater (Mac). Unpacks the NEWEST personal-blocker*.zip from Downloads over THIS folder.
if [ "$1" != "--run" ]; then T="${TMPDIR:-/tmp}/pb-update-$$.sh"; cp "$0" "$T"; exec bash "$T" --run "$(cd "$(dirname "$0")" && pwd)"; fi
cd "$2" || exit 1
HERE="$(pwd)"
Z="$(ls -t "$HOME"/Downloads/personal-blocker*.zip 2>/dev/null | head -1)"
[ -n "$Z" ] || { echo "No personal-blocker*.zip in your Downloads folder. Download the new one first."; read -r -p "Press Enter to close"; exit 1; }
OLD="$(grep -o '"version": *"[^"]*"' src/manifest.json 2>/dev/null | grep -o '[0-9][0-9.]*')"
echo "Using zip:   $Z"
echo "Folder:      $HERE"
TMP="$(mktemp -d)"; unzip -oq "$Z" -d "$TMP" || { echo "Could not unzip $Z"; read -r; exit 1; }
cp -R "$TMP"/. "$HERE"/ && rm -rf "$TMP" "$HERE/src/_metadata"
NEW="$(grep -o '"version": *"[^"]*"' src/manifest.json | grep -o '[0-9][0-9.]*')"
echo "Version:     ${OLD:-?} -> $NEW"
echo
echo "NOW: open chrome://extensions, find Personal Blocker, click Reload (circle arrow)."
echo "Its 'Loaded from' path must be:  $HERE/src"
echo "If it shows a different folder: click Remove, then Load unpacked and pick the folder above."
echo "After Reload the popup must say Version $NEW."
read -r -p "Press Enter to close"
