# Default Carousel Template

This file describes the slide-by-slide structure for the `default` template ID. The content-generation prompt loads it at runtime and uses it as the structural blueprint for the 10-slide carousel.

You can add additional templates by creating new files in this directory (e.g. `comparison.md`, `narrative.md`, `tutorial.md`) and referencing them from individual source items via their `template` field.

The block below is read verbatim into the prompt's `{{template_blueprint}}` placeholder. Edit it, add to it, replace it. Do not remove the slide count — it must stay at 10 unless you also update `config/brand/tokens.json` and the slide template HTML.

---

## Structure

**Slide 1 — Hook**
A single line that makes the scrolling reader stop. State the most surprising or specific detail from the source. Don't tease.
- Headline: ≤8 words.
- Body: optional, ≤15 words.

**Slide 2 — Setup**
One sentence framing why this matters to the audience. Anchor in their lived experience, not abstract significance.
- Headline: ≤8 words.
- Body: ≤30 words.

**Slides 3-5 — Evidence**
The substance of the source material, broken into three digestible beats. Each slide makes one claim, attributed to its source.
- Headline: ≤8 words. State the finding.
- Body: ≤30 words. One supporting detail. No second claim.

**Slides 6-7 — Context**
What the source actually measured; its limits; how to read it honestly. This is the brand-safety slide pair — it's where you protect against overclaiming.
- Headline: ≤8 words.
- Body: ≤30 words.

**Slide 8 — Takeaway**
What the audience can do with this information. Concrete, actionable. Never frame as a guarantee. Phrase as "consider," "look for," "ask about" rather than "this prevents," "this fixes."
- Headline: ≤8 words.
- Body: ≤30 words.

**Slide 9 — Source citation**
The full attribution: study/source name, publication, year, and a shareable link.
- Headline: "Source"
- Body: full citation as written in `attribution` field of the item.

**Slide 10 — CTA**
One ask. Save, share, comment a keyword. Do not stack multiple asks.
- Headline: ≤8 words.
- Body: ≤30 words.

## Visual conventions

- Slide 1 and Slide 10 should visually bookend the carousel with brand-color backgrounds.
- Slides 3-5 use the lightest neutral background to maximize readability of the evidence.
- Slide 9 uses a distinct "citation card" treatment (border, monospaced source line) to signal it's reference material, not opinion.
