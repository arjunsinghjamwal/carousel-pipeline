# Migration Guide — Decoupling the Brand Layer

This document tells you exactly what to change in the existing `goodmuncher-content` codebase to convert it into the generic `carousel-pipeline` framework. Work through it linearly. Each step is a discrete, testable change.

The deliverables in this archive give you the new shape for the generic files (`README.md`, `CLAUDE.md`, `LICENSE`, `NOTICE`, `config.example/`, `src/types/index.ts`). What this guide adds is the *change list* for the source files I didn't have access to.

---

## Phase 0 — Prep

Before any code changes:

1. **Fork the existing repo**. Don't refactor in place — the original is a working internal tool, the fork becomes the public framework. Treat the fork as a fresh repo with no history (the GoodMuncher-era commits are not safe to publish; see Phase 4).
2. **Audit for secrets**. Run `gitleaks detect` or `trufflehog filesystem .` against the existing repo. Anything found gets rotated *and* scrubbed. Even if you start the fork with a clean history, rotate every key that ever touched the old history.
3. **Pick a final name** for the public project. `carousel-pipeline` is a placeholder used throughout these deliverables — search-and-replace it before publishing. Check that the name is available on npm and GitHub.

---

## Phase 1 — Drop in the meta files

These files in the archive are ready to commit as-is, with one find-and-replace each:

| File | Action |
|---|---|
| `LICENSE` | Replace `[YEAR]` and `[YOUR NAME OR ORG]` in any boilerplate; commit verbatim. The Apache 2.0 text itself is canonical and unchanged. |
| `NOTICE` | Replace `[YEAR]` and `[YOUR NAME OR ORG]` at the top. The dependency attributions are accurate as of May 2026 (see `docs/license-audit.md`). |
| `README.md` | Replace `carousel-pipeline` with your final name. Edit the "Acknowledgments" section if you want to credit anyone. |
| `CLAUDE.md` | Replace `carousel-pipeline` with your final name. Otherwise commit as-is. |
| `.gitignore` | Commit as-is. |
| `.env.example` | Commit as-is. Verify the env var names match what your existing code reads. |

---

## Phase 2 — Move the brand layer to `config/`

This is the bulk of the refactor. The goal: nothing brand-specific remains in `src/`, `templates/`, or any prompt file.

### 2.1 Delete the old `brand/` and `facts/` directories

In your fork:

```bash
git rm -r brand/ facts/
```

The old `brand/positioning-v1.1.md`, `brand/tripwires.json`, `brand/voice-examples.json`, `brand/colors.json`, and `facts/upf-facts.json` should not ship in the public repo. They are GoodMuncher's brand IP.

### 2.2 Add the example config

Copy the entire `config.example/` directory from this archive into your fork. This is the worked-example shell users will fork into their own `config/`.

```bash
cp -r path/to/archive/config.example ./config.example
```

The example is intentionally generic — placeholders, not GoodMuncher copy. If you want to include GoodMuncher's actual configuration as a separate, branded sample, put it in `examples/goodmuncher/` rather than `config.example/`. That signals to forking users that it's an illustration, not a default.

### 2.3 Update the path constants in source files

Anywhere your existing code reads from `brand/...` or `facts/...`, replace with `config/...`. Concretely, search your codebase for these strings and update the read paths:

| Old path | New path |
|---|---|
| `brand/tripwires.json` | `config/brand/tripwires.json` |
| `brand/positioning-v1.1.md` | `config/brand/voice.md` |
| `brand/colors.json` | `config/brand/tokens.json` (note: schema also changed — see 2.4) |
| `brand/voice-examples.json` | `config/few-shot.json` |
| `facts/upf-facts.json` | `config/items.json` (note: schema also changed — see 2.5) |

Files likely affected (based on the spec): `src/lib/tripwire-check.ts`, `src/pipeline/generate-content.ts`, `src/pipeline/prompts/content-gen.md`, `templates/slide.css`, `scripts/seed-facts.ts`, `scripts/validate-sanitized-facts.ts`.

### 2.4 Update the colors → tokens schema

The old `brand/colors.json` was probably a flat object like `{"primary": "#024C26", "accent": "#F0D744", ...}`. The new `config/brand/tokens.json` has structure: `colors`, `color_usage_ratio`, `typography`, `slide_dimensions`, `carousel`. See `config.example/brand/tokens.json` for the new shape.

In `templates/slide.css`, replace any hardcoded color values with CSS variables that get injected at composition time. Concretely, change lines like:

```css
.slide.hook { background-color: #024C26; }
```

to:

```css
.slide.hook { background-color: var(--color-primary); }
```

Then update the Puppeteer composition step to read `config/brand/tokens.json` and inject CSS variables on the page before rendering. Example pattern:

```ts
// In compose-slides.ts (when you build it)
const tokens = await loadBrandTokens();
await page.evaluateOnNewDocument((tokens) => {
  const style = document.createElement("style");
  style.textContent = `:root { ${
    Object.entries(tokens.colors)
      .map(([k, v]) => `--color-${k}: ${v};`)
      .join(" ")
  } }`;
  document.head.prepend(style);
}, tokens);
```

### 2.5 Update the facts → items schema

The old `Fact` type had: `id`, `number`, `raw_fact`, `sanitized_claim`, `source_citation`, `source_url`, `tags`, `carousel_format`, `status`, `date_added`, `notes`. The new `SourceItem` type has the same structure with two changes:

| Old field | New field | Reason |
|---|---|---|
| `raw_fact` | `raw_content` | Generic across domains |
| `sanitized_claim` | `sanitized_content` | Same |
| `source_citation` | `attribution` | Same |
| `carousel_format` (enum: `label_decoded` \| `what_i_wish` \| `aisle_walk` \| `swap`) | `template` (any string referencing a template file) | The four hardcoded formats were UPF-specific. The generic version lets the user define any number of templates by adding files to `config/templates/`. |

Replace `src/types/index.ts` wholesale with the version provided in this archive. Then run `tsc --noEmit` and fix the resulting errors site-by-site — most will be field renames, but the `carousel_format` → `template` change touches the prompt branching logic in `generate-content.ts`. See 2.6.

### 2.6 Update `generate-content.ts` for templated prompts

The old prompt switched on `carousel_format` with a hardcoded if/else over four values. The new pattern: load the template file referenced by the item's `template` field and inject it into the prompt's `{{template_blueprint}}` placeholder.

Pseudocode for the change:

```ts
// OLD
const templateName = fact.carousel_format;
const promptTemplate = templates[templateName]; // hardcoded mapping
const prompt = renderPrompt({ ...fact, template: promptTemplate });

// NEW
const templatePath = path.join("config/templates", `${item.template}.md`);
if (!existsSync(templatePath)) {
  throw new PipelineError(
    `Template '${item.template}' not found at ${templatePath}`,
    { stage: "content", item_id: item.id }
  );
}
const templateBlueprint = await fs.readFile(templatePath, "utf8");

const voiceMd = await fs.readFile("config/brand/voice.md", "utf8");
const tripwires = await loadTripwires(); // from config/brand/tripwires.json
const tokens = await loadBrandTokens();   // from config/brand/tokens.json
const copy = await loadBrandCopy();       // from config/brand/copy.json

const prompt = renderTemplate(promptText, {
  brand_voice: voiceMd,
  tripwires_summary: summarizeTripwires(tripwires),
  example_correct_attribution: copy.example_attributions?.correct ?? "",
  example_wrong_attribution: copy.example_attributions?.wrong ?? "",
  tagline: copy.tagline,
  slide_count: tokens.carousel.slide_count,
  template_id: item.template,
  template_blueprint: templateBlueprint,
  cta_example: copy.cta_keywords[0],
  few_shot_examples: await loadFewShotExamples(),
  item_id: item.id,
  sanitized_content: item.sanitized_content,
  attribution: item.attribution,
  source_url: item.source_url,
  tags: item.tags.join(", "),
});
```

The `renderTemplate` helper is a simple `{{key}}` substitution — don't pull in a templating library; ten lines of regex is fine.

### 2.7 Update `tripwire-check.ts` for the new tripwires schema

The old tripwires JSON was probably a flat array of phrases. The new schema is structured by category with rationale. Update the loader and the violation report:

- Loader: parse via `TripwireConfigSchema.parse(json)`.
- Iteration: walk `config.categories[*].phrases[*]`. Each phrase is a discriminated union of `{match: "literal"}` and `{match: "regex", flags?: string}`.
- Violation report: include `category_id` and `phrase` so the review UI can show the rationale.

The unit tests will need updating to match the new structure. The 28 existing tests are still useful — most just need their fixtures rebuilt against the new schema.

### 2.8 Update `templates/slide.html` and `templates/slide.css`

- Remove any GoodMuncher-specific copy (tagline, hero line, hardcoded watermark).
- Replace hex colors with CSS variables (`var(--color-primary)`, etc.) per 2.4.
- The four "role styles" (label_decoded, what_i_wish, aisle_walk, swap) become generic role classes: `.slide.hook`, `.slide.evidence`, `.slide.context`, etc. matching the `SlideRole` enum.
- Move the citation card (slide 9 styling) to be triggered by `data-role="source"` rather than a format-specific selector.

---

## Phase 3 — Generalize the source files I couldn't see

These are files mentioned in your README that I didn't have access to. Use the patterns from Phase 2 to update them:

| File | What to do |
|---|---|
| `src/lib/claude-client.ts` | Likely already generic. Check that the model name is read from env (`ANTHROPIC_MODEL`), not hardcoded. |
| `src/lib/extract-json.ts` | Likely generic. No changes expected. |
| `src/lib/log.ts` | Likely generic. No changes expected. |
| `src/lib/tripwire-check.ts` | Update per 2.7 above. |
| `src/pipeline/generate-content.ts` | Update per 2.6 above. |
| `src/pipeline/prompts/content-gen.md` | Replace with the template version in `config.example/prompts/content-gen.md`. The prompt now lives in `config/`, not `src/`. |
| `src/types/index.ts` | Replace wholesale with the version in this archive. |
| `scripts/preview-slides.ts` | Update path constants per 2.3. The preview script should read from `config/` like everything else. |
| `scripts/validate-sanitized-facts.ts` | Rename to `validate-items.ts`. Update schema reference to `ItemBankSchema`. |
| `tests/tripwire-check.test.ts` | Rebuild fixtures against the new tripwires schema. |
| `tests/generate-content.test.ts` | Rebuild mocks against the new SourceItem schema and the templated prompt. |

---

## Phase 4 — Audit history before publishing

Even after a clean refactor, the git history may contain:

- API keys committed and later removed (still recoverable from history)
- Brand IP in old commits (positioning docs, voice examples, the original facts spreadsheet)
- Internal references (Slack URLs, ticket IDs, customer names in commit messages)

The cleanest path is to start the public repo with a single initial commit — no history at all. Concretely:

```bash
# In your fork, after all Phase 1-3 changes are committed:
rm -rf .git
git init
git add .
git commit -m "Initial public release v1.0.0"
git branch -M main
git remote add origin git@github.com:YOU/carousel-pipeline.git
git push -u origin main --force
```

This is the right call for a tool going from internal-only to public. The downside is that early collaborators can't see the development history — but for an unmaintained release, that doesn't matter.

If you want to preserve some history, use `git filter-repo` to selectively strip commits or paths. That's harder to get right; the fresh-init approach is safer.

---

## Phase 5 — Add CI

A minimal GitHub Actions workflow at `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

Note: `better-sqlite3` is native and needs build tools in CI. The `actions/setup-node` step usually has them available on Ubuntu runners. If you see compile errors, add `apt-get install -y build-essential python3` before `npm ci`.

You said you won't be maintaining the repo, so the CI exists mostly for forks — it tells someone forking the project that the test suite passes, so they have a known-good baseline.

---

## Phase 6 — Publish

Once Phases 1-5 are clean:

1. Tag a release: `git tag -a v1.0.0 -m "Initial public release"` and push the tag.
2. Add a GitHub release with the tag, copying the highlights from your README.
3. Add topics to the GitHub repo: `instagram`, `content-pipeline`, `claude-api`, `gemini-api`, `puppeteer`, `unmaintained`. The last one is honest signaling.
4. Optionally cross-post on Hacker News, Lobsters, or relevant communities. The "FTC/FDA tripwire framework" angle is a strong hook for anyone working in regulated content.

---

## What you do NOT need to do

Because you're not maintaining this:

- **No CONTRIBUTING.md.** You don't take contributions.
- **No CODE_OF_CONDUCT.md.** You don't have a community.
- **No SECURITY.md.** The README's "Security" section says it all.
- **No issue/PR templates.** Issues won't be triaged.
- **No release schedule.** v1.0.0 is the only release.
- **No support channels.** Don't promise what you won't deliver.

Honest unmaintained > performatively maintained.

---

## Estimate

If you do the work yourself in a focused session: 4-8 hours. The decoupling is mechanical but tedious — every file in `src/` needs at least a path-constant check.

If you point Claude Code at this guide and your existing repo: probably 2-3 hours of supervised work, plus your review time. The bottleneck will be verifying the test suite still passes after the schema renames in 2.5 — that's where Claude Code gets stuck on its own.
