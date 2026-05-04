# Contributing to carousel-pipeline

## Status: Seeking Community Maintainers

This project was released by its original author as a working open-source framework. It is architected, documented, and production-tested. What it currently lacks is sustained maintainership: regular dependency updates, compatibility patches when upstream APIs change, and active review of community contributions.

**If you are using this pipeline in production, or building on its architecture, consider stepping into a maintainer role.** The roles below are designed to be low-commitment individually — a small team of people each owning one area is more sustainable than one person owning everything.

To express interest in a role, open a GitHub issue titled "Maintainer interest: [role name]" and describe your context: what you're using the pipeline for and your experience with the relevant stack.

---

## Open maintainer roles

### API Compatibility Maintainer
**Scope:** Track breaking changes in Anthropic (Claude), Google GenAI (Gemini Image), Buffer, and Meta Graph APIs. When an API changes, open an issue with the impact assessment and ideally a PR with the fix.

**Time commitment:** ~1 hour/month of monitoring, plus fix time when changes occur.

**Background needed:** Familiarity with at least one of the four APIs. Ability to run the pipeline end-to-end to validate fixes.

---

### TypeScript / Node.js Maintainer
**Scope:** Keep the TypeScript and Node.js stack current. Dependency updates, Zod schema evolution, Node.js LTS compatibility.

**Time commitment:** ~2 hours/month.

**Background needed:** TypeScript 5.x, Node.js ESM module system, Zod. Experience with `better-sqlite3` is a plus.

---

### Puppeteer / Composition Maintainer
**Scope:** Stage 3 (composition) and the Docker/Chromium dependency stack. Puppeteer is the most environment-sensitive part of the pipeline — macOS, Linux, Docker, and CI all need slightly different configurations.

**Time commitment:** Variable — mostly reactive to Puppeteer version bumps.

**Background needed:** Puppeteer or Playwright experience. Linux system packages for Chromium. Docker.

---

### Template Library Maintainer
**Scope:** Review and merge community-contributed templates in `config.example/templates/`. Ensure new templates follow the structural conventions (10 slides, named roles, word count constraints, visual conventions) and are documented.

**Time commitment:** Light — depends on contribution volume.

**Background needed:** Instagram carousel design sensibility. Ability to run the pipeline to test that a template produces valid slide JSON.

---

### Documentation Maintainer
**Scope:** Keep `README.md`, `CLAUDE.md`, `docs/SPEC.md`, `docs/CONFIGURATION.md`, and `docs/ADVANCED_PROMPTING.md` accurate as the codebase evolves.

**Time commitment:** ~1 hour/month.

**Background needed:** Technical writing. Ability to run the pipeline to verify what the docs describe.

---

## How to contribute

### Reporting bugs

Open a GitHub issue with:
- **Environment:** Node.js version, OS, pipeline version (the `PIPELINE_VERSION` constant in `scripts/run-pipeline.ts`)
- **Stage:** which of the six stages failed (`content`, `images`, `compose`, `review`, `publish`, `metrics`)
- **Error:** full output from the failing command
- **Reproduction:** the minimum `config/` setup needed to reproduce it, without any API keys or proprietary brand content

### Submitting a pull request

1. Fork the repository.
2. Create a branch: `git checkout -b fix/your-description` or `feat/your-description`.
3. Make your change. Follow the code conventions in `CLAUDE.md`.
4. Run the test suite: `npm test && npm run typecheck && npm run lint`.
5. If you changed any TypeScript, run `npm run test:e2e` with a mock item.
6. Open a PR against `main`. Describe what the PR does and why.

### PR review process

Until active maintainers are established, PRs will be reviewed on a best-effort basis.

**PRs that will be merged without extended review:**
- Chromium dependency updates in `Dockerfile`
- Dependency version bumps with no API surface changes
- Documentation corrections (wrong commands, outdated env var names, broken links)
- New templates in `config.example/templates/` that follow the template conventions

**PRs that require maintainer discussion:**
- Changes to `src/lib/tripwire-check.ts`
- Changes to Zod schemas in `src/types/index.ts`
- New pipeline stages or changes to stage contracts
- Changes to the agent API (`src/agent/`)

---

## What this project will not accept

- **Proprietary brand content** in `config.example/` that represents a specific real organization
- **API key handling** changes that weaken the "never commit secrets" invariant
- **Tripwire weakening** — changes that soften or remove tripwire enforcement logic from `src/lib/tripwire-check.ts`
- **Dependencies without clear justification** — the footprint is intentionally small; new dependencies need a concrete case

---

## Code conventions

See `CLAUDE.md` for the full conventions guide. Short version:

- TypeScript strict mode, ES2022 target, NodeNext modules
- Zod for all external data — no `as any`
- No brand-specific values in `src/` — only in `config/`
- Functions over classes (classes only for stateful service clients)
- One pipeline stage = one file with one default export

---

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0, the same license as this project. See [LICENSE](./LICENSE).
