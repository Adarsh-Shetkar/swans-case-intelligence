import type { CitableRecord } from "./types";

const SHARED_RULES = `
Rules you must follow exactly:
- You may ONLY use the records listed below. Never use outside knowledge about this
  case, these people, or personal-injury cases in general.
- Every citation you give must be one of the provided refs (e.g. "r3"), exactly as
  written. Never invent a ref, a date, a name, or a dollar figure that is not present
  in the record text.
- If the records don't clearly support a conclusion, say so explicitly rather than
  guessing. It is always better to under-claim than to over-claim.
- Output must be a single JSON object matching the schema you were given. No prose,
  no markdown code fences, no explanation outside the JSON.
`.trim();

function formatRecords(records: CitableRecord[]): string {
  return records
    .map((r) => {
      const header = [r.ref, r.clioType, r.occurredAt, r.author ?? "", r.subject ?? ""]
        .filter(Boolean)
        .join(" | ");
      // Content is already truncated upstream to fit the prompt budget.
      return `[${header}]\n${r.content}`;
    })
    .join("\n\n---\n\n");
}

export function buildCategorizeEventsPrompt(records: CitableRecord[]): string {
  return `
You are reviewing activity from a personal-injury law case management system
(notes, emails/calls, tasks, calendar entries, documents). Your job is to decide
which of these records represent a MATERIAL DEVELOPMENT in the case, as opposed to
routine administrative activity.

A material development is something like: a change in treatment or diagnosis, a
surgery being scheduled/performed/cancelled, a shift in liability or coverage
information, a new document request or discovery event, expert/IME activity, a
negotiation or demand/offer, a substantive client communication, a change in
damages/specials, or a meaningful deadline.

Routine activity (file this under "skipped", do not create an event) includes things
like: a calendar reminder being created, a routine internal task assignment with no
substantive content, or a duplicate restatement of something already captured by
another record in this batch.

For every record you decide IS a material development, produce one event with:
- title: a short, specific, human-readable label (not a copy of the raw subject line)
- category: one of treatment, surgery, coverage, liability, discovery, experts,
  negotiation, communication, damages, records, deadline, other
- importance: 0-100, where 90-100 is something an attorney must see within minutes of
  opening the case (e.g. a cancelled surgery, a coverage denial), 50-70 is meaningful
  but not urgent, and below 30 is borderline-skippable
- summary: 1-2 sentences, grounded only in the cited record(s)
- occurredAt: the date the development actually happened (from the record), not today
- sourceRefs: the ref(s) that support this event

Multiple records describing the same development (e.g. a note AND a follow-up email
about the same surgery date) should become ONE event citing both refs, not two events.

${SHARED_RULES}

RECORDS:

${formatRecords(records)}
`.trim();
}

export function buildSynthesizeInsightsPrompt(records: CitableRecord[]): string {
  return `
You are producing a small set of headline insights an attorney should see the moment
they open this case, derived ONLY from the records below.

Produce insights of these types, one per type where the evidence allows it (skip a
type entirely rather than fabricate one, or emit it with confidence "unknown" and an
empty sourceRefs array if the case clearly warrants a statement but there's no
supporting evidence yet):

- posture: one sentence describing where the case currently stands overall
- injury: the primary injuries evident from the records (one insight; value can list
  multiple body parts/conditions if the records support each one)
- blocker: something the case cannot move forward on until a specific thing happens
  (e.g. a missing record, an unscheduled procedure, a pending response)
- financial: a concise statement of known case value / specials / firm expenses, each
  clearly labeled with what it is and what it is NOT (e.g. "estimated case value" is
  not the same as "settlement amount")
- coverage: what is known about insurance coverage behind the case, if anything is
  stated in the records

For each insight, set confidence:
- "observed": the value is stated directly and unambiguously in a record
- "ai_synthesis": you combined multiple records to state this, but each component is
  directly observed
- "inferred": you are drawing a reasonable but not certain conclusion
- "unknown": the case plausibly has an answer to this but the records don't show one
  (sourceRefs must be empty in this case)

${SHARED_RULES}

RECORDS:

${formatRecords(records)}
`.trim();
}

export function buildExtractDocumentPrompt(documentText: string, documentName: string): string {
  return `
You are extracting structured medical facts from a single document in a personal-
injury case file. This is for case intelligence and retrieval ONLY — you are not
diagnosing anyone and must not add clinical interpretation beyond what the document
states.

Document name: ${documentName}

For each fact you extract, classify it as:
- injury: a specific injury/body part mentioned as affected
- surgery: a surgical procedure, scheduled, performed, or recommended
- recommendation: a treatment or follow-up recommendation stated by a provider
- diagnosis_note: a diagnosis or clinical finding stated in the document
- other: relevant fact that doesn't fit the above

Include the page number if the document text indicates page breaks (e.g. "--- Page 3
---" markers); omit it if you cannot determine it. Set confidence to "observed" if the
fact is stated plainly, "inferred" if you are reading between the lines of ambiguous
phrasing, and never invent a fact not present in the text.

${SHARED_RULES.replace("records below", "document text below").replace("refs", "page numbers, where available")}

DOCUMENT TEXT:

${documentText}
`.trim();
}
