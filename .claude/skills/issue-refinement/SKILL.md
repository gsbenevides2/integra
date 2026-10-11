---
name: issue-refinement
description: Responde as rodadas de "Refinement doubts" do bot gsbenevides2-chan nas issues do gsbenevides2/integra no lugar do dono, pergunta ao dono só as decisões dele, posta "Refinement Clarification" em inglês, volta o status do projeto para Refining e fica ouvindo novas rodadas. Use quando o usuário pedir para responder/esclarecer dúvidas de refinamento de uma issue ou para ficar ouvindo novas rodadas.
argument-hint: "<número da issue>"
---

# Refinamento de issues

Como as issues deste repositório são refinadas antes da implementação: o bot faz perguntas, o dono responde, e o ciclo se repete até não haver mais dúvidas. Esta skill descreve o processo para o agente responder as rodadas no lugar do dono. O número da issue vem do argumento da skill (`<N>`); se não vier, pergunte ao dono qual issue é.

## Participantes

| Quem | Papel |
|---|---|
| `gsbenevides2-chan` (bot) | Lê a issue e o código, posta um comentário `## Refinement doubts` com perguntas numeradas, cada uma com um `_Reason:_`, e move o card para **Waiting**. |
| `gsbenevides2` (dono) | Responde com um comentário `## Refinement Clarification` e move o card de volta para **Refining**, o que dispara uma nova leitura do bot. |
| Agente (Claude Code) | Responde no lugar do dono: lê as dúvidas, investiga o código, pergunta ao dono só o que é decisão dele, posta a resposta e muda o status. |

## Ciclo de uma rodada

```text
bot posta "Refinement doubts" ──▶ status = Waiting
        │
        ▼
1. Ler o último comentário do bot
2. Investigar o código para cada pergunta
3. Separar: dá para responder pelo código? ou é decisão do dono?
4. Perguntar ao dono (em português, com recomendação) só as decisões
5. Escrever a resposta (em inglês) e postar
6. Mudar o status para Refining
        │
        ▼
bot lê de novo ──▶ nova rodada ou fim
```

### 1. Ler a nova rodada

```bash
# Último comentário da issue
gh issue view <N> --json comments --jq '.comments[-1] | "=== \(.author.login) \(.createdAt)\n\(.body)"'

# Ou um comentário específico, pelo id
gh api repos/gsbenevides2/integra/issues/comments/<ID> --jq .body
```

Só a rodada mais recente importa. As anteriores já estão respondidas, mas servem de contexto: **nunca contradiga uma resposta anterior sem dizer explicitamente que ela está sendo corrigida** ("This replaces the earlier statement that…").

### 2. Investigar o código

Antes de responder, confirme no repositório. Muitas dúvidas do bot partem de premissas erradas, por exemplo:

- citar uma rota que não existe (`GET /api/tuya/devices/:id`);
- falar de um sensor "sem vínculo" com dispositivo, quando a coluna `tuyaDeviceId` é `NOT NULL`;
- mencionar um módulo que não tem rotas (`birthday`);
- supor que um preset guarda dispositivos de destino.

Corrigir a premissa com a referência do código (`arquivo`, coluna, schema) costuma resolver a pergunta sem precisar do dono.

### 3. Classificar cada pergunta

| Tipo | O que fazer | Exemplos |
|---|---|---|
| **Fato do código** | Responder direto, citando o arquivo. | Qual é a rota de tracing; o formato do schema de presets. |
| **Detalhe técnico com padrão claro** | Decidir seguindo os padrões do repo e dizer ao dono o que foi decidido. | Ordem dos hooks do Elysia; upsert à prova de concorrência; nome de arquivos e tabelas; contrato de API. |
| **Decisão de produto, UX, segurança ou infra** | **Perguntar ao dono.** | Códigos de status; o que esconder na UI; proteção contra se trancar fora; implicações entre permissões; configuração do proxy. |

Na dúvida, pergunte. Uma pergunta a mais custa menos que uma decisão errada registrada na issue.

### 4. Perguntar ao dono

- Em **português**.
- Com 2 a 4 opções, a **recomendada primeiro** e marcada como "(Recomendado)", e cada uma com o impacto descrito.
- Agrupe as decisões da rodada numa única interação (até 4 perguntas).
- Se o dono responder algo fora das opções, siga o que ele disse. Se ele não responder uma das perguntas, não invente a resposta: deixe aquele ponto fora do comentário e avise.

### 5. Escrever e postar a resposta

Formato (sempre em **inglês**):

```markdown
## Refinement Clarification

Clarification regarding the previous refinement:

1. **<resumo curto da pergunta>**
   Answer: <decisão em negrito no início> <detalhes: regras, rotas, códigos de status, nomes>
```

Boas práticas:

- Comece cada resposta pela decisão, em negrito, e depois detalhe.
- Seja concreto: caminhos de arquivo, chaves de rota (`METHOD /path`), status e corpo de resposta, nomes de colunas, SQL ou trechos de código quando ajudam.
- Diga o que fica **fora do escopo**, para o bot não perguntar de novo.
- Indique os testes esperados quando a regra for sutil.
- Use português só nos textos que aparecem na UI (ex.: "Sem permissão").

Grave o texto num arquivo temporário (no scratchpad) e poste:

```bash
gh issue comment <N> --body-file <arquivo.md>
```

### 6. Mudar o status para Refining

O status é o campo **Status** do GitHub Project **"Integra Tasks"** (#3). O token do `gh` precisa do escopo `project` (`gh auth refresh -s project`).

```bash
# Descobrir os IDs (item, project, field, option) de uma issue
gh api graphql -f query='{repository(owner:"gsbenevides2",name:"integra"){issue(number:<N>){projectItems(first:10){nodes{id project{id title} fieldValues(first:20){nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}}}}}'

# Mudar para Refining
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <STATUS_FIELD_ID> --single-select-option-id <REFINING_OPTION_ID>

# Conferir
gh api graphql -f query='{repository(owner:"gsbenevides2",name:"integra"){issue(number:<N>){projectItems(first:1){nodes{fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}' \
  --jq '.data.repository.issue.projectItems.nodes[0].fieldValueByName.name'
```

IDs atuais do projeto (válidos para qualquer issue; só o `ITEM_ID` muda):

| Campo | ID |
|---|---|
| Project "Integra Tasks" | `PVT_kwHOArpGQM4BmaKO` |
| Field "Status" | `PVTSSF_lAHOArpGQM4BmaKOzhlDWtw` |
| Opção "Refining" | `b1802916` |
| Outras opções | Backlog `f75ad846`, Waiting `61e4505c`, Developing `47fc9ee4`, Code Review `df73e18b`, Done `98236657` |

## Ouvir novas rodadas

Para não depender de alguém avisar, um monitor em segundo plano consulta a issue a cada 45 segundos e emite um evento quando aparece um comentário novo do bot:

O script está em [`watch.sh`](watch.sh), ao lado deste arquivo:

```bash
.claude/skills/issue-refinement/watch.sh <N>
```

- No Claude Code, rode `watch.sh <N>` com a ferramenta **Monitor** (`timeout_ms` máximo de 30 min). Cada linha `NEW_BOT_COMMENT id=…` vira uma notificação, e o agente executa o ciclo acima com esse `id`.
- Quando o monitor expirar, **reative-o** enquanto o refinamento não terminar.
- `per_page=100` basta enquanto a issue tiver menos de 100 comentários. Acima disso, pagine ou use `?since=<timestamp>`.
- Falhas de rede são ignoradas (`|| true`) para o monitor não morrer por uma requisição que falhou.

## Quando termina

O refinamento termina quando o bot para de postar `Refinement doubts` (ou muda a issue para outro status, como Developing). As rodadas tendem a encolher, de 8 perguntas para 1. Rodadas de uma pergunta só sobre detalhes de manutenção são um bom sinal de que o fim está perto. Nesse ponto, pare o monitor e avise o dono.
