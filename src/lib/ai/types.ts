/**
 * A SourceRecord reshaped for inclusion in a prompt.
 *
 * `ref` is a short, call-local id ("r1", "r2", ...) that the model is told
 * to cite instead of the real database id. This keeps prompts compact and
 * stops the model from ever inventing a plausible-looking but fake Clio/DB
 * id — we build the ref->sourceRecordId map ourselves and do the real
 * lookup after parsing the model's output.
 */
export interface CitableRecord {
  ref: string;
  sourceRecordId: string;
  clioType: string; // "note" | "communication" | "task" | "calendar" | "document" | "activity"
  occurredAt: string; // ISO date/time
  author?: string | null;
  subject?: string | null;
  content: string; // rawContent/excerpt, truncated to fit the prompt budget
}

export interface AiCallMeta {
  matterId: string;
  stage: "categorize_events" | "synthesize_insights" | "extract_document";
  digestId?: string;
}

export interface AiCallResult<T> {
  data: T;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  usedStub: boolean;
}

export class AiValidationError extends Error {
  constructor(message: string, public readonly issues: unknown) {
    super(message);
    this.name = "AiValidationError";
  }
}
