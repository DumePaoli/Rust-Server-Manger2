#!/usr/bin/env bash
# Usage: ./release.sh 1.1.0 "Nouveautés de cette version"
set -e

VERSION="${1:?Usage: ./release.sh <version> <changelog>}"
CHANGELOG="${2:-Release v$VERSION}"

VERSION_FILE="backend/version.py"

# Bump version in version.py
sed -i "s/^VERSION = .*/VERSION = \"$VERSION\"/" "$VERSION_FILE"
echo "Version mise à jour : $VERSION"

# Commit + tag
git add "$VERSION_FILE"
git commit -m "chore: release v$VERSION"
git tag -a "v$VERSION" -m "$CHANGELOG"

# Push commit + tag → déclenche GitHub Actions
git push origin HEAD
git push origin "v$VERSION"

echo ""
echo "✓ Tag v$VERSION poussé."
echo "  GitHub Actions va compiler le .exe et créer la release automatiquement."
echo "  Suivi : https://github.com/DumePaoli/Rust-Server-Manger2/actions"
