# Carousel Pipeline — Project Plan

**Goal:** A generic open-source framework where a new user can (1) set up their branding, (2) list their facts/source items, and (3) run the pipeline to produce Instagram carousels — with no TypeScript knowledge required.

---

## Status at a glance

| Area | Status |
|---|---|
| All 23 source files written | DONE |
| Dependencies installable (`npm install`) | DONE |
| TypeScript typechecks clean (`tsc --noEmit`) | DONE |
| Unit tests pass (24/24) | DONE |
| `templates/slide.html` (Stage 3 blocker) | DONE |
| `scripts/setup.ts` (guided onboarding wizard) | DONE |
| `"setup"` script in `package.json` | DONE |
| Agent HTTP API — `src/agent/router.ts` | DONE |
| Modify `src/review/server.ts` to register agent plugin | DONE |
| Add `"agent"` script alias to `package.json` | DONE |
| Browser review UI — `src/review/ui.html` | DONE |
| OpenAPI 3.1 spec — `docs/openapi.yaml` | DONE |
| `docs/SPEC.md` (pipeline spec) | DONE |
| `docs/CONFIGURATION.md` (config reference) | DONE |

---

## Completed work

### Source files (all in `src/`)
- `src/types/index.ts` — Zod schemas + TypeScript types for all pipeline data
- `src/lib/errors.ts` — `PipelineError` subclasses with stage + item ID
- `src/lib/log.ts` — Pino structured logger (JSON in prod, pretty in dev)
- `src/lib/extract-json.ts` — strips Claude's markdown fences, returns parsed object
- `src/lib/config-loader.ts` — loads and validates `config/brand/`, `config/items.json`, `config/prompts/`
- `src/lib/tripwire-check.ts` — scans copy for banned phrases (literal + regex); primary brand-safety layer
- `src/lib/db.ts` — better-sqlite3 wrapper; `getDb()` / `closeDb()`
- `src/lib/claude-client.ts` — Anthropic SDK wrapper; single `generate()` method
- `src/lib/gemini-client.ts` — `@google/genai` wrapper; returns base64 PNG
- `src/lib/buffer-client.ts` — Buffer API client; `createUpdate()` returns `update_id`
- `src/pipeline/generate-content.ts` — Stage 1: calls Claude, validates `SlideDraftSchema`, checks tripwires
- `src/pipeline/generate-images.ts` — Stage 2: calls Gemini per slide, writes PNGs to `drafts/{id}/images/`
- `src/pipeline/compose-slides.ts` — Stage 3: Puppeteer loads `templates/slide.html`, screenshots 1080×1350 PNGs
- `src/pipeline/push-to-buffer.ts` — Stage 5: schedules post via Buffer API
- `src/review/server.ts` — Fastify review UI server on `localhost:3000`
- `src/metrics/poll-insights.ts` — polls Meta Graph API for posts <30 days old

### Scripts
- `scripts/init-db.ts` — creates `data/pipeline.db` schema
- `scripts/seed-items.ts` — validates and imports `config/items.json`
- `scripts/add-item.ts` — guided CLI for adding a new source item with sanitization
- `scripts/run-pipeline.ts` — orchestrator: single item or batch, logs to `generation_runs`
- `scripts/push-approved.ts` — pushes all approved drafts to Buffer (stub: `getMediaUrls()` must be implemented)

### Tests
- `tests/generate-content.test.ts` — 15 tests: `extractJson` (5) + `SlideDraftSchema` validation (10)
- `tests/tripwire-check.test.ts` — 9 tests: all tripwire patterns including regex, multi-category, caption

### Dependency fixes applied to `package.json`
- `better-sqlite3` bumped `^9.4.3` → `^11.0.0` (Node 22 Windows prebuilt binary; avoids VS C++ requirement)
- `@typescript-eslint/*` bumped `^7` → `^8.0.0` (ESLint 9 peer dep)
- `pino-pretty` added to devDependencies (was missing; referenced in `log.ts`)

---

## Pending tasks

### 1. Agent HTTP API — `src/agent/router.ts` (NEW)

Plan approved. Extends the existing Fastify review server via plugin (`fastify.register(agentRoutes, { prefix: "/agent" })`). No new dependencies.

**Endpoints to implement:**

| Endpoint | Purpose |
|---|---|
| `POST /agent/configure` | Bootstrap `config/`, init DB, merge brand copy + tokens |
| `POST /agent/items` | Append source item to `config/items.json`, auto-assign `item-NNN` ID |
| `GET /agent/items` | Return full item bank |
| `GET /agent/items/:item_id` | Return single item |
| `POST /agent/generate` | Spawn pipeline subprocess non-blocking, return `202` |
| `GET /agent/status/:item_id` | Query `generation_runs`, return `draft_ready` flag |

**Human-in-the-loop boundary (by design):** The agent stops at `draft_ready: true`. A human always approves via the review UI or `POST /queue/:item_id/approve`. The agent has no access to approve/reject endpoints.

**Files to create/modify:**
- `src/agent/router.ts` — CREATE: Fastify plugin with all 6 routes, `activeRuns` Map, Promise mutex
- `src/review/server.ts` — MODIFY: register plugin, wrap `listen` in `async main()`
- `package.json` — MODIFY: add `"agent": "tsx src/review/server.ts"` script alias

### 2. `getMediaUrls()` stub in `scripts/push-approved.ts` — USER-IMPLEMENTED
Currently throws with a clear error message directing the user to upload slides to a public host. This is intentionally left as a stub — implementing S3/GCS upload is outside the generic framework's scope. The README and SPEC should document this clearly.

**Not a blocker** for generating and reviewing carousels locally.

---

## Recommended completion order

1. **Implement `src/agent/router.ts`** — creates the agent API
2. **Modify `src/review/server.ts`** — register the agent plugin
3. **Update `package.json`** — add `"agent"` script alias
4. *(Optional)* Update `README.md` quick-start to lead with `npm run setup`
5. *(User-implemented)* `getMediaUrls()` in `scripts/push-approved.ts` — upload slides to a public host (S3/GCS) and return URLs

---

## Full npm run command reference

```bash
npm run setup              # guided branding setup (first time only)
npm run db:init            # create data/pipeline.db (run once, or after setup)
npm run items:seed         # import config/items.json into DB
npm run pipeline -- --item item-001   # generate one carousel end-to-end
npm run pipeline:daily     # batch: all unused items
npm run review             # localhost:3000 — approve/reject/edit (+ agent API once implemented)
npm run agent              # alias for review — agent-friendly server (PENDING)
npm run push-approved      # push approved drafts to Buffer
npm run metrics:refresh    # poll Meta Graph for posts <30 days old
npm test                   # 24 unit tests
npm run test:e2e           # dry-run (no API calls)
npm run typecheck          # tsc --noEmit
npm run lint               # ESLint
```

---

## Architecture overview

```
npm run setup
  └── writes config/ from config.example/ with user's brand values

npm run items:seed
  └── validates config/items.json → writes to data/pipeline.db

npm run pipeline -- --item item-001
  ├── Stage 1: generate-content.ts  → Claude API → drafts/{id}/slides.json
  ├── Stage 2: generate-images.ts   → Gemini API → drafts/{id}/images/*.png
  └── Stage 3: compose-slides.ts   → Puppeteer  → drafts/{id}/slides/*.png
                                    (requires templates/slide.html)

npm run review             → localhost:3000 → approve/reject/edit

npm run push-approved      → Buffer API → scheduled IG post
npm run metrics:refresh    → Meta Graph API → data/pipeline.db posts table
```

---

---

## Agent API — architecture addendum

```
Agent (LLM)
  ├── POST /agent/configure   → writes config/brand/{copy,tokens}.json, inits DB
  ├── POST /agent/items       → appends to config/items.json, returns item-NNN
  ├── POST /agent/generate    → spawns run-pipeline.ts subprocess, returns 202
  └── GET  /agent/status/:id  → polls generation_runs table

  [draft_ready: true — agent's job ends here]

Human (review UI or API)
  ├── GET  /queue/:item_id    → inspect slides
  ├── PATCH /queue/:item_id/slide/:index  → edit copy
  ├── POST /queue/:item_id/approve        → approve for publishing
  └── POST /queue/:item_id/reject         → reject with reason
```

The `/queue/*` approve/reject routes are **human-only**. The agent has no access to them by design.

---

*Last updated: 2026-05-03*

---

## Update — 2026-05-02

### Agent HTTP API (completed)

- **`src/agent/router.ts`** — Fastify plugin with 6 endpoints under `/agent` prefix: `POST /configure`, `POST /items`, `GET /items`, `GET /items/:item_id`, `POST /generate` (non-blocking, 202), `GET /status/:item_id` (`draft_ready` flag from `generation_runs`). Module-level `activeRuns` Map blocks duplicate runs.
- **`src/review/server.ts`** — registers agent plugin; `listen` converted to `async main()`.
- **`package.json`** — `"agent"` script alias added.

### UX gaps closed (completed)

- **`src/review/ui.html`** — Single-file vanilla JS browser UI served at `GET /`. Two-column layout: queue sidebar (tripwire badges, 30s auto-refresh) + draft panel (10 slides with composed PNGs, inline copy editing via PATCH, Approve/Reject with toast notifications). Zero new dependencies.
- **`docs/openapi.yaml`** — Static OpenAPI 3.1 spec covering all 11 endpoints with full request/response schemas. Served live at `GET /openapi.yaml`.
- **`docs/SPEC.md`** — Pipeline spec: data schemas, stage contracts, retry policy, tripwire semantics, DB schema, agent boundary, versioning.
- **`docs/CONFIGURATION.md`** — Config reference: every field in every `config/` file, status lifecycle, all env vars.

### Current state

All originally planned work is complete. Typechecks clean; 24/24 tests pass.

Remaining user-implemented stub: `getMediaUrls()` in `scripts/push-approved.ts` (upload composed slides to a public host and return URLs — out of scope for the generic framework).

---

## Update — 2026-05-03

### Open-source optimization (completed)

All work from `actions.md` — repositioning for GitHub engagement, visual proof infrastructure, DX improvements, power demo content, template library expansion, and contributor scaffolding. No `src/` code touched; all changes are additive to `config.example/`, docs, and developer tooling.

#### Repository trust / positioning

- **`README.md`** — 7 surgical edits: status line changed to "v1.0 Stable | Active Architecture | Seeking Community Maintainers"; tagline updated; "Not maintained" framing softened to community-fix framing with link to CONTRIBUTING.md; Security section had "repository is unmaintained" removed; Visual proof placeholder, Docker quick start, and template library table added.
- **`CONTRIBUTING.md`** — Created. Status header, 5 open maintainer roles (API Compatibility, TypeScript/Node.js, Puppeteer/Composition, Template Library, Documentation) with scope/time/background for each. Bug report template, PR workflow, fast-merge vs. discussion-required classification, what will not be accepted.

#### DX and infrastructure

- **`Dockerfile`** — `node:20-bookworm-slim` base with full Chromium system dep list for Puppeteer. Intentionally excludes `libappindicator3-1` (removed from Bookworm). Bind-mount dirs pre-created; `PUPPETEER_CACHE_DIR` set; EXPOSE 3000.
- **`docker-compose.yml`** — `pipeline` + `review-ui` services with bind mounts (not named volumes) for `config/`, `drafts/`, `queue/`, `data/`. Both use `env_file: .env`.
- **`scripts/serve-drafts.ts`** — Pure Node.js static server on port 4040 with localtunnel integration for temporary public HTTPS URL (Buffer testing). Path traversal guard; directory listings; CLI `--port` / `--subdomain`; clean SIGINT/SIGTERM handling.
- **`package.json`** — Added `"serve-drafts": "tsx scripts/serve-drafts.ts"` script; `"localtunnel": "^2.0.2"` in devDependencies.

#### Power demo — financial analyst / Nvidia

- **`config.example/items.json`** — Added `item-003`: NVIDIA Q4 FY2026 earnings (sanitized, attributed), `template: "data-scientist"`, tags `["semiconductor", "ai-infrastructure", "earnings", "data-center", "nvidia"]`.
- **`config.example/brand/voice-analyst.md`** — Financial analyst voice template. Sections: Persona, Voice principles (precise/attributed/contextual/grounded), Do/Don't table with CoT-style reasoning column, Taboos (no price targets, no ticker-as-verb, no portfolio advice), Attribution format rules.
- **`config.example/brand/tripwires.json`** — Replaced placeholder categories with `financial_guarantees` (13 literal + regex patterns, SEC/FCA compliance) and `unattributed_health_claims` (7 literal + regex patterns, FTC substantiation).

#### Template library

- **`config.example/templates/data-scientist.md`** — 10-slide quantitative/earnings template: Lead Number → Context Frame → Breakdown ×3 → Guidance → Consensus vs. Actual → What to Watch → Source → CTA.
- **`config.example/templates/minimalist.md`** — 10-slide dark-mode tech template: Statement → Why It Matters ×3 → Numbers ×3 → Contrast → Source → Close.
- **`config.example/templates/b2b-brand.md`** — 10-slide enterprise template: Executive Summary → Challenge → Evidence ×3 → Case Context → Implication → Objection → Source → Next Step.

#### Documentation

- **`docs/ADVANCED_PROMPTING.md`** — Created. 5 CoT techniques for "insight not summary": (1) reasoning steps in voice.md persona, (2) CoT-enhanced do/don't table, (3) reasoning constraints at slide level, (4) "insight not summary" non-negotiable in prompt, (5) reasoning trace in few-shot examples. Symptom → technique lookup table; testing note.
- **`docs/assets/README.md`** — Created. Placeholder with planned asset table (pipeline-demo.gif, review-ui.png, slide-example-01.png, slide-example-02.png), capture instructions, naming convention, GIF optimization guidance.

### Pending manual tasks

- **Visual assets**: Run `npm run demo`, capture screenshots and GIF per `docs/assets/README.md` instructions.
- **Marketing**: LinkedIn/X thread ("How I automated financial reporting carousels"), HN Show HN post, subreddit posts to r/typescript, r/selfhosted, r/marketingautomation. Execute after demo runs cleanly end-to-end.

---

## Update — 2026-05-03 (session 2)

### End-to-end demo debugging (completed)

Fixed a series of issues blocking the `npm run demo` → review UI flow:

- **`localtunnel` missing types** — Created `src/types/localtunnel.d.ts` with minimal Tunnel/Options declarations; updated `loadLocaltunnel()` return type in `scripts/serve-drafts.ts`. Resolves `TS7016`.
- **Review server `ERR_ADDRESS_INVALID`** — Changed `host: "0.0.0.0"` → `host: "127.0.0.1"` in `src/review/server.ts`. `0.0.0.0` is not a valid browser URL on Windows.
- **`ZodError` on `tokens.json`** — Removed `_comment` string keys from inside `color_usage_ratio` and `typography` objects in both `config/brand/tokens.json` and `config.example/brand/tokens.json`. Those objects have `Record<string, number>` and font-object schemas respectively; string annotations are invalid there.
- **Puppeteer Chrome not found** — Resolved by running `npx puppeteer browsers install chrome`.
- **Mock mode not writing `metadata.json` / `slides.json`** — The review server's `/queue` endpoint silently skips drafts without `metadata.json`. `generateContent` (Stage 1) normally writes both files, but mock mode bypasses Stage 1 entirely. Added an explicit write block in `scripts/run-pipeline.ts` for the `isMock` path, writing both `slides.json` and `metadata.json` with a `model: "mock"` field.

Demo now runs end-to-end: `npm run demo` → slides appear in `drafts/item-001/slides/` → review UI at `http://127.0.0.1:3000` shows item-001 with all 10 slide shells.

### Interactive setup wizard — plan approved (pending implementation)

Approved plan to extend `scripts/setup.ts` into a full plug-and-play onboarding wizard. **No new dependencies. Only `scripts/setup.ts` is modified.**

Six phases:

| Phase | What it does | Output |
|---|---|---|
| 0 | Collect API keys with masked terminal input (Node raw mode) | `.env` |
| 1–2 | Existing: brand copy + colors | `config/brand/copy.json`, `tokens.json` |
| 3 | Voice wizard: audience, domain, voice principles, do/don't, taboos, attribution | `config/brand/voice.md` |
| 4 | Tripwire setup: domain menu (financial, health, legal) + custom phrases | `config/brand/tripwires.json` |
| 5 | Source item entry: same prompts as `add-item.ts` in a loop | `config/items.json` |
| 6 | ✓/✗ checklist + offer to run demo / full pipeline / exit now | — |

Key constraints: every phase is skippable; `.env` keys are never logged; all phases are idempotent (ask before overwriting).

### Pending

- **Visual assets** (unchanged from above)
- **Marketing** (unchanged from above)

---

## Update — 2026-05-04

### Setup wizard phases 0, 3–6 (completed)

Implemented all pending phases in `scripts/setup.ts`. No new dependencies — Node built-ins only.

- **Phase 0 — API keys:** `readMasked()` uses Node raw mode (`process.stdin.setRawMode(true)`). Pauses readline before entering raw mode; listens to individual keystrokes; echoes `*`; handles backspace and Ctrl+C. Reads existing `.env` to show masked current values (`sk12****5678`). Writes/updates `.env` without ever logging key values. Five vars: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `BUFFER_ACCESS_TOKEN`, `META_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`.
- **Phase 3 — Voice wizard:** Collects role title, audience, source material type, 2–4 voice principles, do/don't pairs, taboos, attribution format. Generates a fully structured `config/brand/voice.md` matching the template format Claude reads at runtime.
- **Phase 4 — Tripwires:** Domain preset menu (Financial/SEC/FCA, Health/FTC, Legal, Food/FDA). Multiple selectable. Custom literal phrases and regex patterns collected in a loop, assigned to a named category. Writes `config/brand/tripwires.json` preserving the existing schema structure.
- **Phase 5 — Source items:** Detects and offers to remove placeholder example items. Loop: raw content → sanitized → attribution → URL → tags → template → notes, with preview + confirm before each write. "Add another?" after each item, defaults N.
- **Phase 6 — Checklist + first run:** ✓/✗ status for each API key and config file. Three choices: demo (mock, no API calls), generate first carousel (calls Claude + Gemini), open review UI.

### Review UI bug fixes (completed)

- **Slide image filename mismatch** — Puppeteer writes `slide-01.png` (zero-padded) but the UI was requesting `slide-1.png`. Fixed in `src/review/ui.html` line 566: `String(slide.index).padStart(2, '0')`. Slides now render in the review UI.
- **"undefined attempt(s)"** — Mock metadata written by `scripts/run-pipeline.ts` was missing `generation_attempts`. Added `generation_attempts: 1` to the mock metadata write block.

### Current state

Full demo flow verified end-to-end: `npm run setup` → `npm run demo` → `npm run review` → slides render with composed PNGs and correct copy.

Remaining manual tasks: visual assets capture, marketing posts.
