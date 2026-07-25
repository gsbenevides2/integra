#!/usr/bin/env bash

set -euo pipefail

echo "Despachando Coolify"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
-X POST "${COOLIFY_WEBHOOK_URL}" \
-H "Authorization: Bearer ${COOLIFY_TOKEN}")

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "Coolify despachado com sucesso."
else
    echo "Falha ao despachar Coolify. Status HTTP: $HTTP_STATUS"
    exit 1
fi