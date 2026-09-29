# 02 — Self-Introspecting Error Hotfix PR Generator

> 🚧 **Status: in progress.** The architecture is designed and summarized below; the full internal planning document is kept private.

## What it will do

When any production workflow bound to this error workflow fails, a pure-n8n sub-workflow will:

1. Pull the failed workflow's **static JSON definition** via `GET /api/v1/workflows/{id}` (slicing out the failing node's `parameters` and its upstream parents) — and snapshot the `versionId`.
2. Pull the **runtime data** of the crashed execution via `GET /api/v1/executions/{id}?includeData=true` (extracting a redacted skeleton of what the parents actually passed to the failing node), with **sub-workflow cascade tracing** when the error bubbled out of an `executeWorkflow` node.
3. Have an LLM synthesize a **node-level JSON patch** — it only ever sees the failing node's own `parameters`.
4. Deliver the fix as a **GitHub Pull Request** with a diff report (default path), or as an opt-in hot-update via `PUT /api/v1/workflows/{id}` — gated by a `versionId` optimistic-lock re-check so concurrent canvas edits can never be overwritten.

## Scope guardrails (already decided)

- External/credential failures (401/403/429/5xx/timeout) are routed to alerting, not "fixed".
- The LLM only ever outputs replacement `parameters` for one node; deterministic code re-merges them, so canvas position, credentials, and sibling nodes are untouchable.
- Read-only fields (`id`, `createdAt`, `versionId`, `pinData`, `meta`, unknown `settings` keys) are stripped before any `PUT`.

Planned deliverables: `workflow-error-hotfix-pr.json`, `demo-buggy-target-workflow.json` (a 10-second reproduction target), and this README with API payload-cleaning and redaction details.
