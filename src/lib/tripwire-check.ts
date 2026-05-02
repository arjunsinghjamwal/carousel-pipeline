import type {
  SlideDraft,
  TripwireConfig,
  TripwirePhrase,
  TripwireViolation,
} from "../types/index.js";

/**
 * Scan all slide copy (headline + body) and the caption for banned phrases.
 *
 * Returns every violation found. An empty array means the draft passed. Any
 * match — even one — should block the post from advancing. False positives
 * are cheap; false negatives are not.
 *
 * Docs: docs/SPEC.md §5.2
 */
export function checkTripwires(
  draft: SlideDraft,
  config: TripwireConfig
): TripwireViolation[] {
  const violations: TripwireViolation[] = [];

  for (const category of config.categories) {
    for (const phrase of category.phrases) {
      const re = buildMatcher(phrase);

      for (const slide of draft.slides) {
        if (re.test(slide.headline) || re.test(slide.body)) {
          violations.push({
            category_id: category.id,
            phrase: phrase.value,
            slide_index: slide.index,
            in_caption: false,
          });
        }
      }

      if (re.test(draft.caption)) {
        violations.push({
          category_id: category.id,
          phrase: phrase.value,
          in_caption: true,
        });
      }
    }
  }

  return violations;
}

function buildMatcher(phrase: TripwirePhrase): RegExp {
  if (phrase.match === "literal") {
    // Case-insensitive substring match by default — intentionally aggressive.
    return new RegExp(escapeRegex(phrase.value), "i");
  }
  return new RegExp(phrase.value, phrase.flags ?? "i");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
