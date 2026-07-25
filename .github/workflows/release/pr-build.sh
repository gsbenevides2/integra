#!/usr/bin/env bash

set -euo pipefail

echo "Construindo imagem Docker"
docker build --build-arg TOKEN_GITHUB=${TOKEN_GITHUB} -t teste .