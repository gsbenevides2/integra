#!/usr/bin/env bash

set -euo pipefail

echo "Construindo imagem Docker"
docker build --build-arg GITHUB_TOKEN=${GITHUB_TOKEN} -t teste .