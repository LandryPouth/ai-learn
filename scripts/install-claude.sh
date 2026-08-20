#!/usr/bin/env bash
# install-claude.sh — installe ai-learn pour Claude Code.
#
# Idempotent : peut être re-ré-exécuté sans effet de bord.
#
# Ce qu'il fait :
#   1. rend `ai-learn` disponible partout (lien dans ~/.local/bin)
#   2. installe les commandes Claude Code (/learn /status /next /check — la
#      preuve est automatique, pas de /verify) dans ~/.claude/commands/,
#      disponibles dans TOUS les projets.
#
# Usage : bash scripts/install-claude.sh
set -euo pipefail

AI_LEARN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_SOURCE="$AI_LEARN_DIR/bin/ai-learn.js"
LOCAL_BIN="$HOME/.local/bin"
COMMANDS_SOURCE="$AI_LEARN_DIR/commands"
CLAUDE_COMMANDS="$HOME/.claude/commands"

if [ ! -f "$BIN_SOURCE" ]; then
  echo "✗ introuvable : $BIN_SOURCE" >&2
  exit 1
fi

mkdir -p "$LOCAL_BIN" "$CLAUDE_COMMANDS"

# 1. binaire `ai-learn` sur le PATH
if [ ! -e "$LOCAL_BIN/ai-learn" ]; then
  ln -s "$BIN_SOURCE" "$LOCAL_BIN/ai-learn"
  echo "✓ ai-learn → $LOCAL_BIN/ai-learn"
else
  echo "· $LOCAL_BIN/ai-learn déjà présent"
fi

# 2. commandes Claude Code
count=0
for cmd in "$COMMANDS_SOURCE"/*.md; do
  name="$(basename "$cmd")"
  if [ ! -e "$CLAUDE_COMMANDS/$name" ]; then
    ln -s "$cmd" "$CLAUDE_COMMANDS/$name"
    echo "✓ /${name%.md} → $CLAUDE_COMMANDS/$name"
  else
    echo "· /${name%.md} déjà présent"
  fi
  count=$((count + 1))
done

echo
echo "Terminé. ${count} commandes installées. Recharge Claude Code si besoin."
echo "Commande de vérification : ai-learn --help"
