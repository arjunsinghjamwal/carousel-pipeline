# Data Scientist Carousel Template

This file describes the slide-by-slide structure for the `data-scientist` template ID. Designed for quantitative content: earnings reports, benchmark results, research datasets, survey findings with specific numbers.

Use this template when the source item contains multiple distinct metrics that each deserve a dedicated slide, and when the key insight is in the numbers themselves rather than a narrative arc.

The block below is read verbatim into the prompt's `{{template_blueprint}}` placeholder.

---

## Structure

**Slide 1 — Lead Number**
The single most striking figure from the source. State the number, the metric, and the comparison period. Do not editorialize.
- Headline: the number itself (e.g. "$39.3B"). ≤ 5 words.
- Body: what the number is and its year-over-year change. ≤ 20 words.

**Slide 2 — Context Frame**
Why this number matters and what it was measured against. Anchor in the data, not in market sentiment.
- Headline: ≤ 8 words.
- Body: ≤ 30 words. State the comparison base explicitly (e.g. "vs. $23.2B in Q4 FY2025").

**Slide 3 — Breakdown: Segment 1**
First sub-metric or segment. One number, its context, its year-over-year or quarter-over-quarter change. No narrative — let the number speak.
- Headline: the metric name or the number. ≤ 8 words.
- Body: the figure, period, and change. ≤ 30 words.

**Slide 4 — Breakdown: Segment 2**
Second distinct sub-metric or segment. Same format as Slide 3.
- Headline: ≤ 8 words.
- Body: ≤ 30 words.

**Slide 5 — Breakdown: Segment 3**
Third distinct sub-metric or segment. Same format as Slides 3–4.
- Headline: ≤ 8 words.
- Body: ≤ 30 words.

**Slide 6 — Guidance / Forward View**
What the company or source itself stated about the next period. This slide covers stated guidance only — not analyst forecasts, not extrapolations.
- Headline: ≤ 8 words. Frame as guidance (e.g. "Q1 Guidance: $43B").
- Body: the stated figure and any confidence interval. ≤ 30 words. Attribute explicitly: "The company guided..."

**Slide 7 — Consensus vs. Actual**
How reported figures compared to prior expectations. State both numbers; let the audience calculate the delta.
- Headline: ≤ 8 words.
- Body: reported figure, consensus figure, source of consensus (e.g. "FactSet"). ≤ 30 words.

**Slide 8 — What to Watch**
The one forward metric the source suggests is worth monitoring. Phrase as "watch for" or "the next data point is" — not as a forecast.
- Headline: ≤ 8 words.
- Body: the metric to watch and why it is the key indicator. ≤ 30 words.

**Slide 9 — Source**
Full attribution: source name, filing type, period, and URL.
- Headline: "Source"
- Body: full citation as written in the `attribution` field of the item.

**Slide 10 — CTA**
One ask. Comment a keyword to receive the full data breakdown. Do not stack asks. Do not frame as investment advice.
- Headline: ≤ 8 words.
- Body: ≤ 20 words. Keyword CTA only.

## Visual conventions

- Slide 1 uses a high-contrast dark background (`--color-primary`) with the lead number in large type. Optimize for legibility at thumbnail size — this is the hook slide.
- Slides 3–5 use a consistent neutral background. The number should be visually larger than the body copy — use `highlight_word` to mark the key figure on each slide.
- Slide 6 uses a visually distinct treatment (border or slightly different background tint) to signal it is forward-looking, not historical.
- Slide 9 uses the citation card treatment: monospaced source line, bordered box.
- Slide 10 mirrors Slide 1's background for visual bookending.
- All number slides should have generous whitespace. Data slides fail when they are visually crowded.
