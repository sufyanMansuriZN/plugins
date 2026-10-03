#!/usr/bin/env bash
# Regenerate plugins/pstack/ from the upstream commit pinned in UPSTREAM.
#
# Stages, each committed in a scratch git repo so a failure points at one step:
#   1 copy     selected upstream paths at UPSTREAM_SHA (minus Cursor-only skills)
#   2 sed      renames.sed (mechanical vocabulary)
#   3 patches  patches/*.patch (semantic edits, authored against stage 2)
#   4 overlay  overlay/ (files we own), version filled from UPSTREAM
#   5 lint     no Cursor-only references outside lint-allow.txt
# plugins/pstack/ is replaced only when every stage passes.
#
# Usage: sync.sh [--keep DIR] [--no-lint]
#   --keep DIR  build in DIR, keep it, and do not touch plugins/pstack/.
#               To author or refresh a patch: edit DIR/out after the "sed"
#               commit, then `git -C DIR/out diff sed -- <file> > patches/<name>.patch`.
#   --no-lint   skip stage 5 (only valid with --keep)
set -euo pipefail
export LC_ALL=C

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
dest=$repo/plugins/pstack
cache=${XDG_CACHE_HOME:-$HOME/.cache}/pstack-sync/plugins.git

keep= lint=1
while [ $# -gt 0 ]; do
  case $1 in
    --keep) keep=$2; shift 2 ;;
    --no-lint) lint=; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -n "$lint" ] || [ -n "$keep" ] || { echo "--no-lint requires --keep" >&2; exit 2; }

# shellcheck source=UPSTREAM
. "$here/UPSTREAM"

die() { echo "sync-pstack: $*" >&2; exit 1; }

if [ -n "$keep" ]; then
  work=$keep; rm -rf "$work"; mkdir -p "$work"
else
  work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
fi
out=$work/out
mkdir -p "$out"
g() { git -C "$out" -c user.name=sync -c user.email=sync@localhost -c commit.gpgsign=false "$@"; }
stage() { g add -A; g commit -qm "$1" --allow-empty; g tag -f "$1" >/dev/null; }

# --- 1 copy ---------------------------------------------------------------
[ -d "$cache" ] || git init -q --bare "$cache"
git -C "$cache" cat-file -e "$UPSTREAM_SHA^{commit}" 2>/dev/null \
  || git -C "$cache" fetch -q --depth 1 "$UPSTREAM_REPO" "$UPSTREAM_SHA" \
  || die "cannot fetch $UPSTREAM_SHA from $UPSTREAM_REPO"

up_version=$(git -C "$cache" show "$UPSTREAM_SHA:pstack/.cursor-plugin/plugin.json" \
  | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')
[ "$up_version" = "$UPSTREAM_VERSION" ] \
  || die "upstream pstack is $up_version, UPSTREAM says $UPSTREAM_VERSION: set UPSTREAM_VERSION=$up_version and PORT_REV=1"

g init -q
git -C "$cache" archive "$UPSTREAM_SHA" \
    pstack/skills pstack/agents pstack/LICENSE \
    cursor-team-kit/skills/deslop cursor-team-kit/skills/control-ui cursor-team-kit/skills/control-cli \
  | tar -x -C "$work"
mv "$work/pstack/skills" "$work/pstack/agents" "$work/pstack/LICENSE" "$out/"
mv "$work"/cursor-team-kit/skills/* "$out/skills/"
# make-bot-ui drives Cursor-hosted Grok Bot routines (update_state, api2.cursor.sh webhooks)
rm -rf "$out/skills/make-bot-ui"
rm -rf "$work/pstack" "$work/cursor-team-kit"
stage copy

# --- 2 sed ----------------------------------------------------------------
find "$out" -path "$out/.git" -prune -o -type f \( -name '*.md' -o -name '*.sh' -o -name '*.ts' -o -name '*.mjs' \) -print0 \
  | xargs -0 sed -i -E -f "$here/renames.sed"
stage sed

# --- 3 patches ------------------------------------------------------------
for p in "$here"/patches/*.patch; do
  [ -e "$p" ] || continue
  g apply --check "$p" 2>"$work/apply.err" \
    || { cat "$work/apply.err" >&2; die "patch no longer applies: patches/$(basename "$p")"; }
  g apply "$p"
done
stage patches

# --- 4 overlay ------------------------------------------------------------
cp -a "$here/overlay/." "$out/"
sed "s/@VERSION@/$UPSTREAM_VERSION-cc.$PORT_REV/; s/@UPSTREAM_SHA@/$UPSTREAM_SHA/" \
  "$out/.claude-plugin/plugin.json.in" > "$out/.claude-plugin/plugin.json"
rm "$out/.claude-plugin/plugin.json.in"
sed -i "s/@UPSTREAM_SHA@/$UPSTREAM_SHA/" "$out/NOTICE.md"
stage overlay

# --- 5 lint ---------------------------------------------------------------
if [ -n "$lint" ]; then
  # Case-sensitive on purpose: `endCursor` and `author === "cursor"` in watch-pr are GitHub API, not Cursor.
  residue='grok-|gpt-[0-9][0-9.]*-|\.cursor\b|\bCursor\b|cursor-team-kit|AskQuestion\b|`Task`|\bTask (tool|subagent|schema)|environment: *"(cloud|local)"|readonly: *(true|false)|generalPurpose|todolist|inherit-parent|pstack-models\.mdc'
  allow=$(grep -v '^#' "$here/lint-allow.txt" | sed '/^$/d; s/[.]/\\./g; s/^/^/; s/$/:/' | paste -sd'|')
  hits=$(cd "$out" && grep -rnEo --exclude-dir=.git "$residue" . | sed 's|^\./||' | grep -vE "$allow" || true)
  [ -z "$hits" ] || { echo "$hits" >&2; die "Cursor references left (file:line:token above); add a sed rule or patch"; }

  # Claude Code needs kebab-case skill and agent names; upstream has used display names.
  bad=$(cd "$out" && awk 'FNR==1{fm=0} /^---$/{fm++; next} fm==1 && /^name:/{print FILENAME":"$0}' skills/*/SKILL.md agents/*.md \
    | grep -vE ':name: *[a-z0-9]+(-[a-z0-9]+)*$' || true)
  [ -z "$bad" ] || { echo "$bad" >&2; die "non-kebab-case name: add a sed rule"; }
fi

[ -n "$keep" ] && { echo "built in $out (not installed)"; exit 0; }

mkdir -p "$dest"
rsync -a --delete --exclude=/.git "$out/" "$dest/"
echo "plugins/pstack synced to $UPSTREAM_SHA ($UPSTREAM_VERSION-cc.$PORT_REV)"
