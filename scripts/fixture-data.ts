import { hashRecordContent } from "../src/lib/ai/hash";
import type { SourceRecordRow } from "../src/lib/ai/repository";

/**
 * IMPORTANT — what this fixture is and isn't:
 *
 * This is a SYNTHETIC dataset, written by hand to be shaped like the kind of
 * personal-injury matter described in the hackathon briefing (multiple
 * treating providers, a surgery mentioned but not yet scheduled, a
 * policy-limit coverage fact, overlapping notes/tasks/emails, an IME, an
 * outstanding-records blocker, a statute-of-limitations date). It is NOT
 * real Sapini data — this build environment has no network access to
 * Clio/the Sapini matter (see top-level README), so this fixture exists to
 * let the whole pipeline be exercised end-to-end on realistic, varied,
 * multi-type case data before Person A's live Clio ingestion is wired in.
 *
 * Nothing about this fixture's CONTENT is referenced anywhere in the
 * pipeline's application logic (categorize.ts, synthesize.ts, digest.ts,
 * etc.) — those only ever operate on whatever records are passed to them.
 * Swapping this fixture out for Person A's real Sapini SourceRecords
 * requires zero changes downstream.
 */

export interface FixtureMatter {
  id: string;
  clioId: string;
  displayNumber: string;
  status: string;
  description: string;
}

function rec(input: {
  id: string;
  clioType: string;
  occurredAt: string;
  author?: string | null;
  subject?: string | null;
  content: string;
}): SourceRecordRow {
  return {
    id: input.id,
    clioType: input.clioType,
    occurredAt: new Date(input.occurredAt),
    author: input.author ?? null,
    subject: input.subject ?? null,
    rawContent: input.content,
    contentHash: hashRecordContent({
      clioType: input.clioType,
      occurredAt: input.occurredAt,
      author: input.author ?? null,
      subject: input.subject ?? null,
      content: input.content,
    }),
    lastDigestedContentHash: null,
  };
}

export function buildFixtureMatter(): { matter: FixtureMatter; records: SourceRecordRow[] } {
  const matter: FixtureMatter = {
    id: "fixture-matter-1",
    clioId: "fixture-clio-matter-999",
    displayNumber: "24001-Doe",
    status: "Open - Litigation",
    description: "Motor vehicle accident — Doe v. Smith (synthetic fixture matter)",
  };

  const records: SourceRecordRow[] = [
    rec({
      id: "fx-1",
      clioType: "note",
      occurredAt: "2026-06-02T09:00:00Z",
      author: "Intake Paralegal",
      subject: "Intake summary",
      content:
        "Client involved in rear-end collision on 05/28/2026. Reports pain in neck and lower back. Referred to Coastal Orthopedics for evaluation.",
    }),
    rec({
      id: "fx-2",
      clioType: "communication",
      occurredAt: "2026-06-10T13:00:00Z",
      author: "Coastal Orthopedics",
      subject: "Initial evaluation results",
      content:
        "Patient presents with cervical strain and lumbar strain. Recommend physical therapy three times weekly for six weeks. Will reassess after course of treatment.",
    }),
    rec({
      id: "fx-3",
      clioType: "task",
      occurredAt: "2026-06-12T00:00:00Z",
      subject: "Request records from Coastal Orthopedics",
      content: "Follow up to request full treatment notes and billing ledger from Coastal Orthopedics.",
    }),
    rec({
      id: "fx-4",
      clioType: "communication",
      occurredAt: "2026-07-01T15:30:00Z",
      author: "Paralegal",
      subject: "Call with client — status check",
      content: "Client reports continued pain, started physical therapy. No new developments to report.",
    }),
    rec({
      id: "fx-5",
      clioType: "note",
      occurredAt: "2026-07-15T10:00:00Z",
      author: "Attorney",
      subject: "Case value discussion",
      content:
        "Preliminary estimated case value range of $150,000 to $250,000 based on current medical specials and liability clarity.",
    }),
    rec({
      id: "fx-6",
      clioType: "communication",
      occurredAt: "2026-07-20T11:00:00Z",
      author: "Insurer Adjuster",
      subject: "Coverage confirmation",
      content: "Defendant carries a $100,000 per-person bodily injury policy limit. No excess coverage identified.",
    }),
    rec({
      id: "fx-7",
      clioType: "document",
      occurredAt: "2026-08-01T00:00:00Z",
      subject: "Coastal Orthopedics — MRI Report",
      content:
        "MRI of the cervical spine reveals disc herniation at C5-C6. MRI of the right shoulder reveals a partial rotator cuff tear. Surgical consultation recommended for the shoulder findings.",
    }),
    rec({
      id: "fx-8",
      clioType: "communication",
      occurredAt: "2026-08-05T09:00:00Z",
      author: "Attorney",
      subject: "Surgical consult referral",
      content: "Referred client to Dr. Keller for a right shoulder surgical consultation given the MRI findings.",
    }),
    rec({
      id: "fx-9",
      clioType: "note",
      occurredAt: "2026-08-20T14:00:00Z",
      author: "Dr. Keller's office",
      subject: "Surgical consult note",
      content:
        "Right shoulder rotator cuff repair recommended. Surgery not yet scheduled pending insurance pre-authorization.",
    }),
    rec({
      id: "fx-10",
      clioType: "task",
      occurredAt: "2026-08-21T00:00:00Z",
      subject: "Follow up on surgery scheduling",
      content: "Confirm whether the right shoulder surgery has been scheduled; currently pending authorization.",
    }),
    rec({
      id: "fx-11",
      clioType: "communication",
      occurredAt: "2026-09-05T16:00:00Z",
      author: "Paralegal",
      subject: "Call with client",
      content:
        "Client states the shoulder surgery still has not been scheduled and is frustrated with the delay. Continues physical therapy in the meantime.",
    }),
    rec({
      id: "fx-12",
      clioType: "note",
      occurredAt: "2026-09-10T00:00:00Z",
      author: "Billing",
      subject: "Medical specials update",
      content: "Medical specials to date total $31,374.53 across all treating providers.",
    }),
    rec({
      id: "fx-13",
      clioType: "communication",
      occurredAt: "2026-09-15T10:00:00Z",
      author: "Thomas Physical Therapy",
      subject: "Outstanding records request",
      content:
        "We have not received a response to our last request for case status; please confirm whether the firm needs updated treatment notes.",
    }),
    rec({
      id: "fx-14",
      clioType: "calendar",
      occurredAt: "2026-09-18T09:00:00Z",
      subject: "Independent medical examination",
      content: "Independent medical examination scheduled with Dr. Whitfield at the defendant's request.",
    }),
    rec({
      id: "fx-15",
      clioType: "note",
      occurredAt: "2026-09-19T15:00:00Z",
      author: "Attorney",
      subject: "IME completed",
      content:
        "Independent medical examination completed with Dr. Whitfield. Report pending; expected to address causation of the shoulder injury.",
    }),
    rec({
      id: "fx-16",
      clioType: "communication",
      occurredAt: "2026-09-24T14:00:00Z",
      author: "Paralegal",
      subject: "Call with client",
      content:
        "Called client to discuss the upcoming right shoulder surgery. Client reports ongoing pain and some anxiety about the procedure.",
    }),
    rec({
      id: "fx-17",
      clioType: "activity",
      occurredAt: "2026-09-01T00:00:00Z",
      subject: "Case expense — records retrieval",
      content: "Firm paid $450.00 for certified copies of medical records from Coastal Orthopedics.",
    }),
    rec({
      id: "fx-18",
      clioType: "task",
      occurredAt: "2026-09-27T00:00:00Z",
      subject: "Employment records overdue",
      content: "Client has not yet provided requested employment and wage-loss documentation; overdue by two weeks.",
    }),
    rec({
      id: "fx-19",
      clioType: "communication",
      occurredAt: "2026-09-28T11:00:00Z",
      author: "Defense Counsel",
      subject: "Settlement posture",
      content:
        "Defense indicates willingness to discuss resolution once the shoulder surgery is completed and final specials are known.",
    }),
    rec({
      id: "fx-20",
      clioType: "note",
      occurredAt: "2026-09-29T00:00:00Z",
      author: "Attorney",
      subject: "Statute reminder",
      content: "Statute of limitations deadline is 05/28/2028, two years from the incident date. No immediate deadline risk.",
    }),
  ];

  return { matter, records };
}

/**
 * A plausible next record for a matter that's already been through one
 * digest run — used by the fixture harness to demonstrate that a THIRD run
 * only processes this single new record, not the other 20.
 */
export function buildFollowUpRecord(): SourceRecordRow {
  return rec({
    id: "fx-21",
    clioType: "communication",
    occurredAt: "2026-10-01T10:00:00Z",
    author: "Dr. Keller's office",
    subject: "Surgery scheduled",
    content: "Right shoulder rotator cuff repair has now been authorized and scheduled for 10/20/2026.",
  });
}
