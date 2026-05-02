import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkTripwires } from "../src/lib/tripwire-check.js";
import type { SlideDraft, TripwireConfig } from "../src/types/index.js";

// ---- fixtures ----

const TRIPWIRE_CONFIG: TripwireConfig = {
  version: "1.0.0",
  categories: [
    {
      id: "health_claims",
      description: "Unattributed health claims",
      rationale: "FTC requires substantiation for health claims",
      phrases: [
        { match: "literal", value: "cures" },
        { match: "literal", value: "prevents" },
        { match: "regex", value: "\\bguaranteed?\\b", flags: "i" },
      ],
    },
    {
      id: "brand_causation",
      description: "Language implying brand causes health outcomes",
      rationale: "Brand must not be positioned as causing outcomes",
      phrases: [
        { match: "literal", value: "our product fixes" },
        { match: "regex", value: "\\b(we|our brand)\\s+(help|fix|cure)s?\\b", flags: "i" },
      ],
    },
  ],
};

function makeDraft(overrides: Partial<SlideDraft> = {}): SlideDraft {
  return {
    item_id: "item-001",
    template_id: "default",
    created_at: "2026-01-01T00:00:00.000Z",
    model: "claude-opus-4-7",
    slides: Array.from({ length: 10 }, (_, i) => ({
      index: i + 1,
      role: i === 0
        ? "hook"
        : i === 8
        ? "source"
        : i === 9
        ? "cta"
        : "evidence",
      headline: `Slide ${i + 1} headline`,
      body: `Slide ${i + 1} body text that is safe.`,
      image_prompt: "NO TEXT abstract background",
    })),
    caption: "Safe caption text.",
    hashtags: ["#topic", "#research", "#health"],
    cta: "SAVE",
    attribution: "Smith et al., 2024",
    source_url: "https://example.com/study",
    ...overrides,
  };
}

// ---- tests ----

describe("checkTripwires", () => {
  it("returns empty array for a clean draft", () => {
    const violations = checkTripwires(makeDraft(), TRIPWIRE_CONFIG);
    assert.deepEqual(violations, []);
  });

  it("catches a literal phrase in a slide headline (case-insensitive)", () => {
    const draft = makeDraft();
    draft.slides[0].headline = "This CURES your problem";

    const violations = checkTripwires(draft, TRIPWIRE_CONFIG);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].category_id, "health_claims");
    assert.equal(violations[0].phrase, "cures");
    assert.equal(violations[0].slide_index, 1);
    assert.equal(violations[0].in_caption, false);
  });

  it("catches a literal phrase in a slide body", () => {
    const draft = makeDraft();
    draft.slides[2].body = "This prevents illness.";

    const violations = checkTripwires(draft, TRIPWIRE_CONFIG);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].phrase, "prevents");
    assert.equal(violations[0].slide_index, 3);
  });

  it("catches a regex phrase in a slide body", () => {
    const draft = makeDraft();
    draft.slides[1].body = "Results are guaranteed.";

    const violations = checkTripwires(draft, TRIPWIRE_CONFIG);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].category_id, "health_claims");
    assert.equal(violations[0].phrase, "\\bguaranteed?\\b");
  });

  it("catches a phrase in the caption", () => {
    const draft = makeDraft({ caption: "This product cures everything." });

    const violations = checkTripwires(draft, TRIPWIRE_CONFIG);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].in_caption, true);
    assert.equal(violations[0].slide_index, undefined);
  });

  it("catches violations across multiple categories", () => {
    const draft = makeDraft();
    draft.slides[0].body = "Our product fixes the issue.";
    draft.slides[1].headline = "It cures everything.";

    const violations = checkTripwires(draft, TRIPWIRE_CONFIG);
    assert.equal(violations.length, 2);
    const categoryIds = violations.map((v) => v.category_id);
    assert.ok(categoryIds.includes("brand_causation"));
    assert.ok(categoryIds.includes("health_claims"));
  });

  it("catches multiple violations in the same slide", () => {
    const draft = makeDraft();
    draft.slides[0].body = "It cures and prevents disease.";

    const violations = checkTripwires(draft, TRIPWIRE_CONFIG);
    assert.equal(violations.length, 2);
  });

  it("returns empty array when config has no categories", () => {
    const emptyConfig: TripwireConfig = { version: "1.0.0", categories: [] };
    const violations = checkTripwires(makeDraft(), emptyConfig);
    assert.deepEqual(violations, []);
  });

  it("does not flag safe paraphrases of banned phrases", () => {
    const draft = makeDraft();
    draft.slides[0].body = "Researchers found a correlation with improved outcomes.";
    draft.slides[1].headline = "Study associated diet with lower risk.";

    const violations = checkTripwires(draft, TRIPWIRE_CONFIG);
    assert.deepEqual(violations, []);
  });
});
