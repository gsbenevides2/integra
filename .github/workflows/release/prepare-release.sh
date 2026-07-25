#!/usr/bin/env bash

set -euo pipefail

# =========================
# Verifica mudança de versão
# =========================
echo "Verificando mudança de versão..."

NEW_VERSION=$(jq -r '.version // empty' package.json)

if [ -z "$NEW_VERSION" ]; then
    echo "Nenhuma versão encontrada em package.json"
    exit 1
fi

OLD_VERSION=$(
    git show HEAD~1:package.json 2>/dev/null \
    | jq -r '.version // empty' 2>/dev/null \
    || echo ""
)

if [ "$NEW_VERSION" = "$OLD_VERSION" ]; then
    echo "A Versão não mudou ($NEW_VERSION)"
    exit 1
fi

echo "Nova versão detectada: $NEW_VERSION"

# =========================
# Obtém tag anterior
# =========================

PREV_TAG=$(git tag --sort=-version:refname | head -1)

echo "Tag anterior: ${PREV_TAG:-<nenhuma>}"

echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT
echo "prev_tag=$PREV_TAG" >> $GITHUB_OUTPUT