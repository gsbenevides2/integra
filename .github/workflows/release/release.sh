#!/usr/bin/env bash

set -euo pipefail

# =========================
# Monta contexto para IA
# =========================
echo "Montando contexto para geração de release notes..."

{
    echo "Versão: v${VERSION}"
    echo

    echo "=== COMMITS ==="

    if [ -z "$PREV_TAG" ]; then
        git log --format="- %s (%h by %an)"
    else
        git log "${PREV_TAG}..HEAD" --format="- %s (%h by %an)"
    fi

    echo
    echo "=== DIFF (sem arquivos de lock e node_modules) ==="

    if [ -z "$PREV_TAG" ]; then
        git diff HEAD~5..HEAD -- . ':!bun.lock' ':!node_modules' 2>/dev/null > /tmp/full_diff.txt || true
    else
        git diff "${PREV_TAG}..HEAD" -- . ':!bun.lock' ':!node_modules' 2>/dev/null > /tmp/full_diff.txt || true
    fi
    head -c 40000 /tmp/full_diff.txt || true
} > /tmp/changes.txt
echo "Contexto montado em /tmp/changes.txt"

# =========================
# Gera release notes
# =========================
echo "Gerando release notes com IA..."

cat > /tmp/prompt.txt << 'EOF'
Você é um assistente especializado em criar release notes de software.

Analise os commits e o diff abaixo e gere release notes em português para a versão indicada.

Organize em categorias com emojis:
- 🚀 Novidades
- 🐛 Correções
- ⚡ Melhorias
- 🔧 Mudanças internas

Use markdown com listas.

Seja informativo e conciso.

Ignore menções a bun.lock e node_modules.

EOF

cat /tmp/changes.txt >> /tmp/prompt.txt

# Chamada direta à API do OpenRouter (sem CLI intermediária): um erro da API aparece no log.
MODEL="xiaomi/mimo-v2.6-pro"

RESPONSE=$(jq -n --arg model "$MODEL" --rawfile prompt /tmp/prompt.txt \
    '{model: $model, messages: [{role: "user", content: $prompt}]}' |
    curl -sS --max-time 300 https://openrouter.ai/api/v1/chat/completions \
        -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
        -H "Content-Type: application/json" \
        -d @- 2>/tmp/openrouter.err || true)

GENERATED=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty' 2>/dev/null || true)

echo "Release notes geradas (ou fallback):"
echo "$GENERATED"

if [ -z "$GENERATED" ]; then
    echo "Nenhuma release note gerada, usando fallback."
    echo "--- resposta do OpenRouter (sem o conteúdo gerado):"
    echo "$RESPONSE" | head -c 2000
    echo
    echo "--- stderr do curl:"
    cat /tmp/openrouter.err || true
    GENERATED="Release automático - veja os commits para detalhes."
fi

echo "$GENERATED" > /tmp/release_notes.md

# =========================
# Cria tag caso não exista
# =========================

echo "Criando tag ${VERSION} se não existir..."

TAG="v${VERSION}"

if git ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
    echo "Tag ${TAG} already exists on origin, skipping creation."
else
    git tag "$TAG"
    git push origin "$TAG"
fi

# =========================
# Obtém owner/repo
# =========================
echo "Obtendo informações do repositório..."

REPO_NAME="${FULL_REPO##*/}"
REPO_OWNER="${FULL_REPO%%/*}"

# =========================
# Cria Release no GitHub
# =========================
echo "Criando release ${TAG} no GitHub..."

curl \
    -sS \
    -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${TOKEN_GITHUB}" \
    "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases" \
    -d @- <<EOF
{
  "tag_name": "${TAG}",
  "name": "${TAG}",
  "body": $(jq -Rs . < /tmp/release_notes.md),
  "make_latest": "true"
}
EOF

echo "Release ${TAG} criada com sucesso. No GitHub."
