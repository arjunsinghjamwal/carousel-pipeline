# B2B Brand Carousel Template

This file describes the slide-by-slide structure for the `b2b-brand` template ID. Designed for enterprise and professional services content: industry reports, consulting insights, B2B SaaS metrics, regulatory updates, workforce research.

The B2B register is credible and measured. Content is structured like a briefing document: context, evidence, implication. The audience is a professional who will share this with colleagues.

The block below is read verbatim into the prompt's `{{template_blueprint}}` placeholder.

---

## Structure

**Slide 1 — Executive Summary**
The single insight a decision-maker needs to take from this carousel. Frame as a business implication, not a data point.
- Headline: ≤ 10 words. Present tense. Declarative.
- Body: ≤ 20 words. The "so what" in one sentence.

**Slide 2 — The Challenge**
The industry problem or trend this content addresses. Anchors the audience's existing context.
- Headline: ≤ 8 words. Frame the tension.
- Body: ≤ 30 words. One pain point. Do not stack problems.

**Slide 3 — Evidence: Finding 1**
First data point supporting the challenge or the solution. Fully attributed.
- Headline: ≤ 8 words. State the finding.
- Body: ≤ 30 words. Source, year, sample size where available.

**Slide 4 — Evidence: Finding 2**
Second data point. Same format as Slide 3.
- Headline: ≤ 8 words.
- Body: ≤ 30 words.

**Slide 5 — Evidence: Finding 3**
Third data point. Same format as Slides 3–4.
- Headline: ≤ 8 words.
- Body: ≤ 30 words.

**Slide 6 — Case Context**
The conditions under which the evidence holds. What type of company, market, or context applies. This slide earns trust — it shows the audience you understand the scope of your claim.
- Headline: ≤ 8 words.
- Body: ≤ 30 words. Scope qualifiers, methodology notes, or population description.

**Slide 7 — Implication**
What a professional in this field should consider in response to the evidence. Frame as "consider," "evaluate," or "examine" — not as a directive.
- Headline: ≤ 8 words.
- Body: ≤ 30 words. Actionable but qualified.

**Slide 8 — Common Objection**
The most credible pushback against the main claim, stated fairly. Acknowledge it, then address it in one sentence. This is the trust-building slide.
- Headline: "A common objection:" or similar framing. ≤ 8 words.
- Body: objection in one clause; response in one clause. ≤ 30 words total.

**Slide 9 — Source**
Full citation for primary sources used across the carousel. Include methodology note if available.
- Headline: "Source"
- Body: full citation as written in the item's `attribution` field. Link if space allows.

**Slide 10 — Next Step**
A professional CTA. Invite the audience to share with a colleague, save for a team meeting, or comment a keyword for the full report.
- Headline: ≤ 8 words. Professional register — no exclamation marks.
- Body: ≤ 20 words. One ask.

## Visual conventions

- Typography priority: this template benefits from a serif headline font (e.g. Georgia, Playfair Display) if available in `templates/fonts/`. If not, use the brand's configured headline font at a heavier weight.
- Slide 1 and Slide 10: use `--color-primary` as background. These are the "cover" visual bookends.
- Slides 3–5 (evidence): light neutral background. Dense but well-padded. Body copy matters more here than on other templates.
- Slide 8 (objection): visually distinct from evidence slides — use a slightly different background tint or a left-border accent using `--color-accent` to signal "this is a different kind of slide."
- No stock-photo-style background imagery. Text is the primary design element. Background images, if used, should be abstract or architectural.
