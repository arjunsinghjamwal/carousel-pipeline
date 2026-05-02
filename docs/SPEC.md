# Carousel Pipeline — Technical Specification

**Version:** 1.0.0
**Status:** Stable

This document is the authoritative reference for the pipeline's design: data schemas, stage contracts, retry policy, tripwire semantics, database schema, and the agent API boundary.

For day-to-day operational guidance see [CLAUDE.md](../CLAUDE.md). For configuration field-level reference see [CONFIGURATION.md](./CONFIGURATION.md).

---

## Table of contents

1. [Overview](#1-overview)
2. [Data schemas](#2-data-schemas)
3. [Stage contracts](#3-stage-contracts)
4. [Retry policy](#4-retry-policy)
5. [Tripwire semantics](#5-tripwire-semantics)
6. [Database schema](#6-database-schema)
7. [Agent API boundary](#7-agent-api-boundary)
8. [Brand-safety reasoning](#8-brand-safety-reasoning)
9. [Pipeline versioning](#9-pipeline-versioning)

---

## 1. Overview

The pipeline turns structured source items into published Instagram carousels through six sequential stages:

```
items → content → images → composition → review → publish → metrics
  1         2        3           4          —        5          6
```

| Stage | Script / module | Input | Output |
|---|---|---|---|
| **1 — Content** | `src/pipeline/generate-content.ts` | `SourceItem` | `drafts/{id}/slides.json`, `drafts/{id}/metadata.json` |
| **2 — Images** | `src/pipeline/generate-images.ts` | `SlideDraft` | `drafts/{id}/images/*.png` |
| **3 — Composition** | `src/pipeline/compose-slides.ts` | images + `slides.json` | `drafts/{id}/slides/*.png` |
| **4 — Review** | `src/review/server.ts` (human) | composed PNGs | approval marker or rejection |
| **5 — Publish** | `src/pipeline/push-to-buffer.ts` | approved draft | Buffer `update_id` → `posts` table |
| **6 — Metrics** | `src/metrics/poll-insights.ts` | `posts` table | `metrics` table rows |

Each stage writes exclusively to its declared outputs. Stages are independently replayable: re-running Stage 3 (composition) re-generates PNGs from the current `slides.json` without re-calling Claude or Gemini.

---

## 2. Data schemas

All schemas are defined in [`src/types/index.ts`](../src/types/index.ts) using Zod. The Zod schema is the source of truth; this section documents intent and constraints.

### 2.1 SourceItem

The atomic unit of input. Lives in `config/items.json`, seeded into the database by `scripts/seed-items.ts`.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | string | `/^item-\d{3,}$/` | Stable forever. Never reused, even after retirement. |
| `number` | integer | > 0 | Human-facing sequence number from source spreadsheet. |
| `raw_content` | string | non-empty | Verbatim source text. Audit trail. Never edited after seed. |
| `sanitized_content` | string | non-empty | Brand-safe rewrite. The only version Claude ever sees. |
| `attribution` | string | non-empty | Full citation as shown on the source slide. |
| `source_url` | string | valid URL | Canonical link to original source. |
| `tags` | string[] | default `[]` | Free-form topic tags for search and analytics. |
| `template` | string | non-empty, default `"default"` | References `config/templates/{template}.md`. |
| `status` | enum | see below | Lifecycle state. |
| `date_added` | string | ISO date | When item entered the bank. |
| `notes` | string | optional | Free-text context for the human who added the item. |

**Status values:**

```
unused → drafted → approved → published
                ↘ rejected (back to unused or retired)
any    → retired
```

- `unused` — not yet processed by the pipeline
- `drafted` — pipeline has produced a draft; awaiting human review
- `approved` — human approved; ready for Buffer push
- `published` — Buffer push confirmed and Meta Graph reports publish
- `retired` — removed from active rotation; ID never reused

### 2.2 SlideDraft

Stage 1 output. Validated by `SlideDraftSchema` before being written to disk and before Stage 2 consumes it.

| Field | Type | Constraints |
|---|---|---|
| `item_id` | string | `/^item-\d{3,}$/` |
| `template_id` | string | non-empty |
| `created_at` | string | ISO timestamp |
| `model` | string | Claude model ID used |
| `slides` | Slide[] | exactly 10 elements |
| `caption` | string | ≤ 2200 chars (Instagram limit) |
| `hashtags` | string[] | 3–5 items |
| `cta` | string | `/^[A-Z]+$/` — uppercase only |
| `attribution` | string | copied verbatim from item |
| `source_url` | string | valid URL, copied from item |

### 2.3 Slide

One element of `SlideDraft.slides`.

| Field | Type | Constraints |
|---|---|---|
| `index` | integer | ≥ 1 |
| `role` | enum | `hook \| setup \| evidence \| context \| takeaway \| source \| cta` |
| `headline` | string | ≤ 8 words |
| `body` | string | ≤ 30 words |
| `highlight_word` | string | optional — one word rendered in accent color |
| `image_prompt` | string | ≥ 10 chars; must not request text in image |

### 2.4 Metadata

Sidecar file written alongside `slides.json` at `drafts/{id}/metadata.json`.

| Field | Type | Notes |
|---|---|---|
| `item_id` | string | |
| `created_at` | string | ISO timestamp |
| `pipeline_version` | string | semver string from `PIPELINE_VERSION` constant |
| `generation_attempts` | integer | number of Claude calls made (≥ 1 due to retry) |
| `tripwire_checks.passed` | boolean | true only if zero violations |
| `tripwire_checks.violations` | TripwireViolation[] | empty array if passed |
| `hash` | string | sha256 of `slides.json` — change invalidates downstream output |

### 2.5 TripwireViolation

One entry per matched banned phrase.

| Field | Type | Notes |
|---|---|---|
| `category_id` | string | matches `id` in `tripwires.json` |
| `phrase` | string | the exact matched text |
| `slide_index` | integer | optional — present if match was in a slide |
| `in_caption` | boolean | true if match was in the caption |

---

## 3. Stage contracts

### Stage 1 — Content generation (`generate-content.ts`)

**Reads:**
- `config/brand/voice.md`
- `config/brand/copy.json`
- `config/brand/tokens.json` (for `slide_count`, `carousel.slide_count`)
- `config/brand/tripwires.json`
- `config/prompts/content-gen.md` (prompt template)
- `config/templates/{item.template}.md`
- `config/few-shot.json` (optional)

**Calls:** Claude API (`ANTHROPIC_MODEL`, default `claude-opus-4-7`)

**Writes:**
- `drafts/{item_id}/slides.json` — validated `SlideDraft`
- `drafts/{item_id}/metadata.json` — `Metadata` with tripwire results

**Fails if:** Claude returns unparseable JSON after one retry; or tripwire check fails (violations written to metadata but stage throws).

**Does NOT write to DB.** The orchestrator (`run-pipeline.ts`) writes to `generation_runs`.

### Stage 2 — Image generation (`generate-images.ts`)

**Reads:** `drafts/{item_id}/slides.json`

**Calls:** Gemini API (`@google/genai`) — one call per slide using `slide.image_prompt`

**Writes:** `drafts/{item_id}/images/slide-{N}.png` — 1024×1024 PNG, base64-decoded

**Constraint:** Every `image_prompt` must contain "NO TEXT" or the negative constraint is prepended automatically. This is enforced in `generate-images.ts`, not in the schema.

### Stage 3 — Composition (`compose-slides.ts`)

**Reads:**
- `drafts/{item_id}/slides.json`
- `drafts/{item_id}/images/slide-{N}.png`
- `templates/slide.html`
- `config/brand/tokens.json` (injected as CSS variables via `{{CSS_VARS}}`)
- `config/brand/copy.json` (brand name, tagline)

**Calls:** Puppeteer — one browser launch per carousel, one screenshot per slide

**Writes:** `drafts/{item_id}/slides/slide-{N}.png` — 1080×1350 PNG (Instagram 4:5)

**Is independently replayable.** Editing `slides.json` via the review UI and re-running Stage 3 regenerates PNGs without re-calling Claude or Gemini.

### Stage 4 — Review (human-gated)

Not a pipeline stage in code. The review server (`src/review/server.ts`) exposes JSON endpoints and a browser UI at `GET /`.

**Human writes:**
- `drafts/{item_id}/approved.json` — via `POST /queue/:item_id/approve`
- `drafts/{item_id}/rejected.json` — via `POST /queue/:item_id/reject`

### Stage 5 — Publish (`push-to-buffer.ts`)

**Reads:** `drafts/{item_id}/approved.json` (existence check), `slides.json`

**Requires:** `NODE_ENV=production` — throws if missing to prevent dev publishes.

**Calls:** Buffer API — `POST /updates/create.json`

**Writes to DB:** `posts` table — `buffer_update_id`, `scheduled_at`, `caption`

**Stub:** `getMediaUrls()` must be implemented by the user (upload slides to S3/GCS and return public URLs). See `scripts/push-approved.ts`.

### Stage 6 — Metrics (`poll-insights.ts`)

**Reads:** `posts` table — all rows where `published_at` is within 30 days

**Calls:** Meta Graph API — `/{ig_media_id}/insights` per post

**Writes to DB:** `metrics` table — one row per poll per post

**Rate limit:** 200 calls/hour per user token. The poller respects this by batching.

---

## 4. Retry policy

**The orchestrator owns retry logic. Stages never retry internally.**

Implemented in `scripts/run-pipeline.ts`:

1. Each stage is called once.
2. If a stage throws, the error is caught, logged to `generation_runs` (`status: "failed"`, `error_message`), and the run halts.
3. **Claude parse retry (exception):** Stage 1 (`generate-content.ts`) calls Claude once. If the response fails JSON parsing, it makes one follow-up call with the parse error attached. This retry is internal to Stage 1 and is not surfaced to the orchestrator as a failure — it is logged in `metadata.generation_attempts = 2`.
4. Batch runs (`--batch`) continue to the next item on failure. Single-item runs exit immediately.

Rationale: Automatic retries at the orchestrator level risk burning API quota on non-transient failures (prompt logic errors, schema mismatches). A human should inspect failed runs in `generation_runs` before re-running.

---

## 5. Tripwire semantics

Implemented in [`src/lib/tripwire-check.ts`](../src/lib/tripwire-check.ts). Reads `config/brand/tripwires.json`.

### How matching works

Each phrase in `tripwires.json` has a `match` field:

- **`"literal"`** — case-insensitive substring match. The phrase `"example banned phrase"` matches `"This Example Banned Phrase is fine"` (match) and `"example banned phrases"` (match — substring).
- **`"regex"`** — JavaScript `RegExp` match with optional `flags`. The `flags` field defaults to `"i"` if not provided. The regex is applied to each field individually (not the whole slide as a string).

### What is scanned

For every draft, the checker scans:
- Every slide's `headline`, `body`, and `highlight_word`
- The top-level `caption`

### What a hit does

Any match produces a `TripwireViolation` entry. If any violations exist:
- `metadata.tripwire_checks.passed = false`
- `metadata.tripwire_checks.violations` is populated
- Stage 1 throws — the draft is not advanced to Stage 2
- The run is logged as `failed` in `generation_runs`
- The draft directory is written to disk for inspection (the draft is NOT deleted)

### Philosophy

The checker is intentionally aggressive. False positives (blocking copy that was fine) are cheap — a human can edit the slide and re-run. False negatives (allowing a banned phrase through) are expensive — they risk a brand-safety incident. When in doubt, add to `tripwires.json`, not to the prompt.

**Never weaken the checker to fix a false positive.** Rewrite the copy or adjust the prompt's few-shot examples instead.

---

## 6. Database schema

Database file: `data/pipeline.db` (configurable via `DB_PATH` env var).
Initialized by: `scripts/init-db.ts` (safe to re-run — all `CREATE TABLE IF NOT EXISTS`).

### `generation_runs`

One row per stage per pipeline run. The audit log for every generation attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `item_id` | TEXT NOT NULL | e.g. `item-007` |
| `stage` | TEXT NOT NULL | `content`, `images`, or `compose` |
| `status` | TEXT NOT NULL | `started`, `completed`, or `failed` |
| `started_at` | TEXT NOT NULL | ISO timestamp |
| `completed_at` | TEXT | NULL until completed or failed |
| `error_message` | TEXT | NULL unless `status = 'failed'` |
| `pipeline_version` | TEXT | semver from `PIPELINE_VERSION` constant |

Index: `idx_runs_item_id` on `(item_id)`.

**`draft_ready`** — defined as: a row exists with `item_id = ?` AND `stage = 'compose'` AND `status = 'completed'`. The agent API's `GET /agent/status/:item_id` uses exactly this query.

### `posts`

One row per published carousel. Created by Stage 5.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID or item_id-derived |
| `item_id` | TEXT NOT NULL UNIQUE | |
| `buffer_update_id` | TEXT | Set after Buffer push |
| `ig_media_id` | TEXT | Set after Meta Graph confirms publish |
| `published_at` | TEXT | ISO timestamp from Meta Graph (not Buffer) |
| `scheduled_at` | TEXT | UTC — Buffer's `scheduled_at` field |
| `caption` | TEXT | IG caption as pushed |
| `created_at` | TEXT NOT NULL | `datetime('now')` default |

### `metrics`

One row per daily poll per post. Created by Stage 6.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `post_id` | TEXT NOT NULL | References `posts.id` |
| `polled_at` | TEXT NOT NULL | ISO timestamp |
| `reach` | INTEGER | |
| `impressions` | INTEGER | |
| `likes` | INTEGER | |
| `comments` | INTEGER | |
| `shares` | INTEGER | |
| `saves` | INTEGER | |
| `profile_visits` | INTEGER | |
| `follows` | INTEGER | |

Index: `idx_metrics_post_id` on `(post_id)`.

---

## 7. Agent API boundary

The agent API (`/agent/*`) is designed for an LLM agent (or MCP tool) to operate the pipeline without human involvement up to the review gate.

### What agents can do

| Endpoint | Action |
|---|---|
| `POST /agent/configure` | Write brand config files, initialize DB |
| `POST /agent/items` | Add a source item to the bank |
| `GET /agent/items` | Read the full item bank |
| `GET /agent/items/:item_id` | Read a single item |
| `POST /agent/generate` | Spawn pipeline subprocess (non-blocking, returns 202) |
| `GET /agent/status/:item_id` | Poll until `draft_ready: true` |

### What agents cannot do

The approve and reject endpoints (`POST /queue/:item_id/approve`, `POST /queue/:item_id/reject`) are **intentionally not accessible** via the agent prefix. They live only in the review server's flat route space. An agent has no route to approve its own drafts.

This is the human-in-the-loop boundary. It is enforced by route structure, not by authentication — the assumption is that the agent only knows about `/agent/*` routes.

### Duplicate run prevention

`POST /agent/generate` tracks in-flight subprocesses in a module-level `activeRuns` Map. If `item_id` (or `__batch__`) is already running, the endpoint returns `409 Conflict`. This prevents runaway duplicate pipeline launches from a polling agent.

### Machine-readable API contract

See [`docs/openapi.yaml`](./openapi.yaml) for the full OpenAPI 3.1 specification of all endpoints.

---

## 8. Brand-safety reasoning

Brand safety is enforced by two independent layers. Both must pass for a post to advance.

### Layer 1 — Seed-time sanitization

**When:** At item creation, before the item ever enters the pipeline.

**Who:** The human (or agent) adding the item. `scripts/add-item.ts` guides through this.

**What:** `raw_content` (verbatim source) is rewritten into `sanitized_content`. The sanitization rule: every claim must be attributed to the source in past tense, without implying the brand causes or prevents any outcome.

**Why this layer exists:** By the time Claude sees the content, the unsafe framing has been removed. The model cannot accidentally regenerate a claim it never saw.

### Layer 2 — Runtime tripwire check

**When:** After Stage 1 generates copy, before it is written to disk as approved.

**Who:** `src/lib/tripwire-check.ts`, automatically, on every generation run.

**What:** Every slide and the caption are scanned against all phrases in `config/brand/tripwires.json`. Any match fails the run.

**Why two layers:** Sanitization handles source material. The tripwire handles model output. Even well-sanitized input can produce phrasing that the model introduces independently (from its training data). The tripwire is the last line of defense before a human sees the draft.

**Important:** The tripwire list should expand over time as new risky patterns are discovered. It should never shrink without an explicit human decision.

---

## 9. Pipeline versioning

### Version constant

`PIPELINE_VERSION` is a constant in `scripts/run-pipeline.ts` (currently `"1.0.0"`). It is written into every `metadata.json` at generation time.

### What a version bump means

A pipeline version bump is required when:
- The `SlideDraft` or `Slide` schema changes in a breaking way
- The `Metadata` schema changes
- The composition template (`templates/slide.html`) changes in a way that makes old `slides.json` incompatible

Minor changes to config files (brand voice, tripwires, prompt wording) do not require a version bump.

### Migration policy

- **Never migrate already-drafted posts across a pipeline version bump.** Regenerate them from the source item or retire them.
- Schema changes to the SQLite database require a migration script in `scripts/migrations/NNN-description.ts` and a manual run before the next pipeline invocation.
- The `pipeline_version` field in `metadata.json` lets you identify which drafts were generated under which version.
