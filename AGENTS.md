# AGENTS.md

Bun + Elysia + React + Drizzle (PostgreSQL) home daemon. Read `docs/development.md` before changing code; module details are in `docs/`.

## Definition of done (run all, fix until green)

```text
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit
bun run test        # 100% line/function coverage enforced; tests mirror source under test/
```

- New or changed code needs tests in `test/` mirroring the source path. Never lower coverage or add to `LINE_COVERAGE_EXEMPT` in `test/check-coverage.ts` without a browser-only reason.
- Never run crons, hardware (Tuya/TP-Link/SSH) or `db:sync` against the live environment while testing (see "Safety" in `docs/development.md`). Mock them.
- Code identifiers in English, UI copy in pt-BR.

## Pull requests

- Branch `openhands/issue-N`, one PR per issue, body in pt-BR: what changed, how it was validated (paste test output), `Closes #N`.
- The PR runs PR-Agent review + tests + Docker build in CI. Fix failures and address review comments by pushing to the same branch; do not open a new PR.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
