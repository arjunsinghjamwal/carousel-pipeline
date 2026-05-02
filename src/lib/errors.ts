/**
 * Domain error for pipeline failures.
 *
 * Every pipeline stage wraps low-level errors in a PipelineError so the
 * orchestrator can log them with stage + item_id context rather than a raw
 * stack trace.
 *
 * Docs: docs/SPEC.md §5.3
 */
export class PipelineError extends Error {
  readonly stage: string;
  readonly item_id: string;
  override readonly cause: unknown;

  constructor(
    message: string,
    context: { stage: string; item_id: string; cause?: unknown }
  ) {
    super(message);
    this.name = "PipelineError";
    this.stage = context.stage;
    this.item_id = context.item_id;
    this.cause = context.cause;
  }
}
