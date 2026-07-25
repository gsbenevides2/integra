#!/usr/bin/env bash

set -euo pipefail

# =========================
# Publica imagem Docker no GitHub Container Registry
# =========================

REPO_NAME="${FULL_REPO##*/}"
REPO_OWNER="${FULL_REPO%%/*}"
REGISTRY="ghcr.io"
IMAGE_NAME="${REPO_NAME}"
IMAGE_URL="${REGISTRY}/${REPO_OWNER}/${IMAGE_NAME}"
LATEST_TAG="${IMAGE_URL}:latest"
MINOR_VERSION=$(echo "$VERSION" | cut -d. -f1-2)
MINOR_TAG="${IMAGE_URL}:${MINOR_VERSION}"
MAJOR_VERSION=$(echo "$VERSION" | cut -d. -f1)
MAJOR_TAG="${IMAGE_URL}:${MAJOR_VERSION}"
VERSION_TAG="${IMAGE_URL}:${VERSION}"

echo "Logando no Github Container Registry..."

echo "${TOKEN_GITHUB}" | docker login ${REGISTRY} -u "${REPO_OWNER}" --password-stdin

echo "Construindo e publicando imagem Docker com tag ${VERSION}..."
docker build --build-arg TOKEN_GITHUB=${TOKEN_GITHUB} -t "${VERSION_TAG}" .

echo "Imagem Docker construída com tag ${VERSION_TAG}, marcando também como ${LATEST_TAG}, ${MINOR_TAG}, ${MAJOR_TAG}..."
docker tag "${VERSION_TAG}" "${LATEST_TAG}"
docker tag "${VERSION_TAG}" "${MINOR_TAG}"
docker tag "${VERSION_TAG}" "${MAJOR_TAG}"

echo "Publicando imagem Docker com tag ${VERSION}..."
docker push "${VERSION_TAG}"
docker push "${LATEST_TAG}"
docker push "${MINOR_TAG}"
docker push "${MAJOR_TAG}"

echo "Imagem Docker publicada com tags: ${VERSION_TAG}, ${LATEST_TAG}, ${MINOR_TAG}, ${MAJOR_TAG}"
