/**
 * Extract a JSON object from a Claude response string.
 *
 * Claude may wrap JSON in markdown fences even when explicitly instructed not
 * to. This strips the fence if present, then parses. Throws a SyntaxError on
 * failure so the caller can retry with the parse error appended to the
 * conversation.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // Strip optional markdown fences (```json or ```)
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/);
  const raw = fenced ? fenced[1] : trimmed;

  return JSON.parse(raw);
}
