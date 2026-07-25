#!/usr/bin/env bash

set -euo pipefail

echo "Construindo e publicando imagem Docker com tag ${VERSION}..."
docker build --build-arg TOKEN_GITHUB=${TOKEN_GITHUB} -t teste .