#!/usr/bin/env bash

set -euo pipefail

# =========================
# Monta tags e labels da imagem Docker publicada no GitHub Container Registry.
# O build e o push ficam com docker/build-push-action (cache de camadas no GHA).
# =========================

IMAGE_URL="ghcr.io/${FULL_REPO,,}"
MINOR_VERSION=$(echo "$VERSION" | cut -d. -f1-2)
MAJOR_VERSION=$(echo "$VERSION" | cut -d. -f1)
DESCRIPTION=$(jq -r '.description' package.json)

{
    echo "tags<<EOF"
    echo "${IMAGE_URL}:${VERSION}"
    echo "${IMAGE_URL}:${MINOR_VERSION}"
    echo "${IMAGE_URL}:${MAJOR_VERSION}"
    echo "${IMAGE_URL}:latest"
    echo "EOF"

    echo "labels<<EOF"
    echo "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "org.opencontainers.image.description=${DESCRIPTION}"
    echo "org.opencontainers.image.licenses=MIT"
    echo "org.opencontainers.image.revision=${GITHUB_SHA}"
    echo "org.opencontainers.image.source=https://github.com/${FULL_REPO}"
    echo "org.opencontainers.image.title=${FULL_REPO##*/}"
    echo "org.opencontainers.image.url=https://github.com/${FULL_REPO}"
    echo "org.opencontainers.image.version=${VERSION}"
    echo "EOF"
} >> "$GITHUB_OUTPUT"

echo "Tags e labels da imagem ${IMAGE_URL}:${VERSION} gerados."
