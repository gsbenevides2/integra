---
name: task-maker
description: Orientações para executar uma tarefa ou demanda
---

## Orientações para executar uma tarefa ou demanda

### 1. Planejamento

Antes de iniciar qualquer demanda, sempre faça um planejamento:

- Analise todo o código relevante para a tarefa
- Crie um arquivo de plano em formato markdown em `/tmp/` com:
  - Descrição detalhada da demanda
  - Lista de arquivos que serão alterados
  - Passos de implementação
  - Possíveis riscos e considerações
- Sempre faça questionamentos caso tenha dúvidas sobre os requisitos

**Exemplo de estrutura do plano:**
```markdown
# Plano: [Nome da Demanda]

## Descrição
[Descrição detalhada do que precisa ser feito]

## Arquivos Afetados
- src/arquivo1.ts
- src/arquivo2.ts

## Passos de Implementação
1. [Passo 1]
2. [Passo 2]

## Riscos e Considerações
- [Risco 1]
- [Consideração 1]
```

### 2. Configuração do Ambiente

Execute os comandos git para atualizar o ambiente local e criar sua branch:

```bash
git fetch origin
git checkout -b nome-da-branch origin/main
```

### 3. Padrão de Nomes de Branch

Siga o padrão abaixo para nomear suas branches:

- `feat/nome-da-nova-feature` (para novas funcionalidades)
- `fix/nome-do-bug-corrigido` (para correções de bugs)
- `docs/nome-da-documentacao-criada` (para documentação)

**Exemplo:** `feat/adicionar-autenticacao-usuario`

### 4. Validação Pós-Implementação

Após executar a demanda:

1. **Verifique o README.md**: Atualize se houver mudanças em:
   - Variáveis de ambiente
   - Comandos disponíveis
   - Estrutura do projeto
   - Instruções de instalação/configuração

2. **Sincronize o banco de dados** (se aplicável):
   ```bash
   # Verifique se há alterações nos models antes de rodar
   bun run db:sync
   ```

3. **Execute verificações de código**:
   ```bash
   bun run lint    # Verifica erros de estilo
   bun run build   # Verifica erros de compilação
   ```

### 5. Bump da versão

Ao finalizar atualize o package.json fazendo bump da minor. Ex: 0.0.1 -> 0.0.2

### 6. Criação do Commit

Crie um commit seguindo o padrão Conventional Commits:

```
feat: nome da nova feature
fix: nome do bug corrigido
docs: nome da documentação criada
```

**Regras para o commit:**
- Inclua uma descrição detalhada no corpo do commit
- Nunca inclua o arquivo de plano no commit (mantenha em `/tmp/`)
- Use o tipo correto (feat, fix, docs, etc.)

**Exemplo de commit:**
```bash
git commit -m "feat: adicionar autenticação de usuário

- Implementar login com JWT
- Adicionar middleware de autenticação
- Criar rotas de cadastro e login

Closes #123"
```

### 7. Criação da PR

Após o commit e push:

1. Abra a PR usando a GitHub CLI:
   ```bash
   gh pr create --title "feat: nome da feature" --body "Descrição da PR"
   ```

2. Inclua na descrição da PR:
   - Resumo das alterações
   - Plano de implementação (copie do arquivo criado na etapa 1)
   - Instruções de teste (se aplicável)

## Considerações de Código

### Variáveis de Ambiente

Ao modificar variáveis de ambiente:

1. **README.md**: Adicione valores de exemplo
2. **Arquivos de configuração**: Use valores falsos em:
   - `.github/workflows/pr-build.yml`
   - `Dockerfile`
   - `.env.example`

### Models e Documentação

- Sempre inclua os metadados do Zod nos tipos dentro dos models
- Isso é necessário para uma boa documentação no Elysia
- Consulte outros models de exemplo no projeto

## Checklist de Implementação

- [ ] Plano criado em `/tmp/`
- [ ] Branch criada com nome correto
- [ ] Código implementado
- [ ] README.md atualizado (se necessário)
- [ ] Banco de dados sincronizado (se necessário)
- [ ] Lint passando
- [ ] Build passando
- [ ] Bump de Versão
- [ ] Commit criado com mensagem correta
- [ ] Push realizado
- [ ] PR criada com descrição completa