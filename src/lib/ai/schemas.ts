import { z } from "zod";

/**
 * These schemas are the enforcement mechanism behind two hard rules from the
 * brief:
 *   1. AI output must be structured, never free text we parse with regex.
 *   2. AI must never invent facts — every non-"unknown" claim must cite at
 *      least one real source record, and the schema itself rejects output
 *      that doesn't.
 *
 * A record that fails validation against these schemas is NOT written to
 * the database. See lib/ai/gemini.ts for the retry-then-fail behavior, and
 * lib/ai/persist.ts for what happens to a failed stage (the run continues;
 * only that stage's output is skipped and logged).
 */

export const EventCategory = z.enum([
  "treatment",
  "surgery",
  "coverage",
  "liability",
  "discovery",
  "experts",
  "negotiation",
  "communication",
  "damages",
  "records",
  "deadline",
  "other",
]);
export type EventCategoryT = z.infer<typeof EventCategory>;

// "last_contact" is computed deterministically now (see
// compute-last-contact.ts), NOT requested from the LLM. It stays in this
// shared enum for type consistency with that deterministic output, and as
// a defensive filter target in synthesize.ts in case a model produces one
// anyway despite the prompt no longer asking for it.
export const InsightType = z.enum(["posture", "injury", "last_contact", "blocker", "financial", "coverage"]);
export type InsightTypeT = z.infer<typeof InsightType>;

export const ConfidenceLevel = z.enum(["observed", "ai_synthesis", "inferred", "unknown"]);
export type ConfidenceLevelT = z.infer<typeof ConfidenceLevel>;

// A citation is the call-local `ref` (e.g. "r14") assigned when we built the
// prompt — never a free-form string, never a real database id the model
// could hallucinate.
const CitedRef = z
  .string()
  .regex(/^r\d+$/, "citations must reference a provided record ref like 'r3'");

// ISO date or date-time — accept either since source material is sometimes
// date-only (a task due date) and sometimes a timestamp (an email).
const FlexibleDate = z.string().refine(
  (val) => !Number.isNaN(Date.parse(val)),
  { message: "must be a parseable date/date-time string" }
);

export const CaseEventDraft = z.object({
  title: z.string().min(3).max(140),
  category: EventCategory,
  importance: z.number().int().min(0).max(100),
  summary: z.string().min(10).max(500),
  occurredAt: FlexibleDate,
  sourceRefs: z.array(CitedRef).min(1, "every event must cite at least one source record"),
});
export type CaseEventDraftT = z.infer<typeof CaseEventDraft>;

export const CaseEventBatch = z.object({
  events: z.array(CaseEventDraft),
  // Records the model considered but deliberately did NOT turn into an
  // event (routine/duplicate activity). Keeping this makes "why wasn't X
  // surfaced" answerable instead of silent, and lets us audit for
  // over-suppression.
  skipped: z
    .array(
      z.object({
        ref: CitedRef,
        reason: z.string().min(3).max(200),
      })
    )
    .default([]),
});
export type CaseEventBatchT = z.infer<typeof CaseEventBatch>;

export const InsightDraft = z
  .object({
    type: InsightType,
    label: z.string().min(2).max(80),
    value: z.string().min(1).max(500),
    confidence: ConfidenceLevel,
    // Short internal rationale — not necessarily shown verbatim in the UI,
    // but kept for audit/debugging and for the "why" affordance.
    reasoning: z.string().max(300).optional(),
    sourceRefs: z.array(CitedRef),
  })
  .refine((insight) => insight.confidence === "unknown" || insight.sourceRefs.length > 0, {
    message: "an insight that isn't 'unknown' must cite at least one source record",
    path: ["sourceRefs"],
  });
export type InsightDraftT = z.infer<typeof InsightDraft>;

export const InsightBatch = z.object({
  insights: z.array(InsightDraft),
});
export type InsightBatchT = z.infer<typeof InsightBatch>;

// --- Document intelligence (schema defined now; OCR/extraction pipeline is
// a deferred "nice to have" per the 4-hour scope cut — see README) ---------

export const DocumentFactCategory = z.enum([
  "injury",
  "surgery",
  "recommendation",
  "diagnosis_note",
  "other",
]);
export type DocumentFactCategoryT = z.infer<typeof DocumentFactCategory>;

export const DocumentFactDraft = z.object({
  category: DocumentFactCategory,
  text: z.string().min(3).max(300),
  page: z.number().int().positive().optional(),
  confidence: ConfidenceLevel,
});
export type DocumentFactDraftT = z.infer<typeof DocumentFactDraft>;

export const DocumentExtractionBatch = z.object({
  facts: z.array(DocumentFactDraft),
});
export type DocumentExtractionBatchT = z.infer<typeof DocumentExtractionBatch>;
