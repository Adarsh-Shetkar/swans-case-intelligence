// src/lib/mocks/index.ts
import type { Pulse, Digest, TimelineEvent, Actions, EvidenceRecord } from "@/lib/api-contract";

const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();


export const pulse: Pulse = {
  matter: { id: "mock-1", displayNumber: "00000-Mock", name: "Sample Client: MVA", status: "Open", practiceArea: "Personal Injury", syncedAt: ago(0.1) },
  client: { name: "Sample Client" },
  posture: "Treatment ongoing; demand package being prepared.",
  value: { min: 18000, max: 25000, sourceRecordIds: ["r1"] },
  coverage: { amount: 25000, sourceRecordIds: ["r4"] },
  specials: { amount: 31374.53, sourceRecordIds: ["r2"] },
  expenses: { amount: 4210, sourceRecordIds: ["r8"] },
  lastClientContact: { at: ago(9), summary: "Call about PT schedule", sourceRecordIds: ["r6"] },
  topRisk: "Policy limits may cap recovery below specials.",
};

export const digest: Digest = {
  summary: "Rear-end collision; liability appears clear. Client is in PT after an orthopedic evaluation. Insurer disclosed a $25K policy limit, which is close to medical specials.",
  keyFacts: [
    { text: "Primary injuries: cervical and lumbar strain per orthopedic report.", sourceRecordIds: ["r3"] },
    { text: "Adverse carrier confirmed $25,000 per-person limit.", sourceRecordIds: ["r4"] },
    { text: "Client missed one PT session in the last month.", sourceRecordIds: ["r5"] },
  ],
};

export const timeline: TimelineEvent[] = [
  { id: "e1", title: "Collision", category: "liability", importance: 70, summary: "Client rear-ended at a stop.", occurredAt: ago(120), sourceRecordIds: ["r1"] },
  { id: "e2", title: "Orthopedic evaluation", category: "treatment", importance: 85, summary: "Cervical and lumbar strain diagnosed.", occurredAt: ago(90), sourceRecordIds: ["r3"] },
  { id: "e3", title: "Policy limits disclosed", category: "coverage", importance: 95, summary: "$25K per-person limit confirmed.", occurredAt: ago(30), sourceRecordIds: ["r4"] },
  { id: "e4", title: "Missed PT session", category: "treatment", importance: 55, summary: "Client no-show.", occurredAt: ago(12), sourceRecordIds: ["r5"] },
  { id: "e5", title: "Client call", category: "communication", importance: 40, summary: "Discussed PT schedule.", occurredAt: ago(9), sourceRecordIds: ["r6"] },
  { id: "e6", title: "Records requested", category: "records", importance: 35, summary: "Requested PT records.", occurredAt: ago(3), sourceRecordIds: ["r7"] },
  { id: "e7", title: "Case expenses posted", category: "damages", importance: 30, summary: "Filing and records fees.", occurredAt: ago(2), sourceRecordIds: ["r8"] },
];

export const actions: Actions = {
  overdue: [{ id: "a1", title: "Send demand outline to attorney", dueAt: ago(2), owner: "Paralegal", sourceRecordIds: ["r7"] }],
  upcoming: [{ id: "a2", title: "PT re-evaluation", dueAt: ago(-5), owner: "Provider", sourceRecordIds: ["r5"] }],
  waitingOn: [{ id: "a3", title: "Insurer response to records", owner: "Adverse carrier", sourceRecordIds: ["r4"] }],
};

export const evidence: EvidenceRecord[] = [
  { id: "r1", clioType: "note", occurredAt: ago(120), author: "Intake", subject: "Intake notes", excerpt: "Client stopped; vehicle struck from behind." },
  { id: "r2", clioType: "document", occurredAt: ago(20), subject: "Medical bills summary", excerpt: "Total billed to date: $31,374.53." },
  { id: "r3", clioType: "document", occurredAt: ago(90), subject: "Ortho report (scan)", excerpt: "Assessment: cervical and lumbar strain." },
  { id: "r4", clioType: "communication", occurredAt: ago(30), author: "Adverse carrier", subject: "Re: policy limits", excerpt: "Per-person limit is $25,000." },
  { id: "r5", clioType: "calendar", occurredAt: ago(12), subject: "PT session", excerpt: "No-show." },
  { id: "r6", clioType: "note", occurredAt: ago(9), author: "Staff", subject: "Call with client", excerpt: "Discussed PT schedule." },
  { id: "r7", clioType: "task", occurredAt: ago(3), subject: "Request PT records" },
  { id: "r8", clioType: "document", occurredAt: ago(2), subject: "Expense ledger", excerpt: "Firm costs to date: $4,210." },
];