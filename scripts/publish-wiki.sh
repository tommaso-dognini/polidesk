#!/usr/bin/env bash
# Copies docs/wiki/*.md into the GitHub wiki of the repository.
#   scripts/publish-wiki.sh <owner>/<repo>
# The wiki must exist: create its first page once from github.com/<owner>/<repo>/wiki.
# In the wiki, links between pages have no ".md" suffix, so it is stripped while copying.
set -euo pipefail
repo="${1:?uso: scripts/publish-wiki.sh <utente>/<repo>}"
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git clone --quiet "https://github.com/${repo}.wiki.git" "$tmp/wiki"
for f in "$here"/docs/wiki/*.md; do
  # (Page-Name.md) and (Page-Name.md#anchor) → (Page-Name) / (Page-Name#anchor); external links are untouched
  sed -E 's/\]\(([A-Za-z0-9_-]+)\.md(#[^)]*)?\)/](\1\2)/g' "$f" > "$tmp/wiki/$(basename "$f")"
done
cd "$tmp/wiki"
git add -A
if git diff --cached --quiet; then echo "Wiki già aggiornata."; exit 0; fi
git commit --quiet -m "Aggiorna la wiki da docs/wiki"
git push --quiet
echo "Wiki pubblicata: https://github.com/${repo}/wiki"
