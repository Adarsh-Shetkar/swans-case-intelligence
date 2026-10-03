# Case Intelligence Dashboard

Full-stack dashboard for personal-injury firms. Reads a live matter from the Clio Manage API
(read-only OAuth) and condenses notes, emails and documents into a source-linked AI case digest,
KPI row and ranked timeline. Includes a provider-sharing portal with revocable links.

**Team of 3.** Original repo: (https://github.com/keethu12345/swans-case-intelligence)
**My contribution:** project scaffold, Prisma/Postgres schema, typed API contract, frontend
(dashboard, evidence drawer, timeline, action center) and the provider-sharing portal.

## Stack
Next.js, TypeScript, Tailwind, shadcn/ui, PostgreSQL, Prisma, Zod, Clio Manage API, Gemini

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env` and `.env.local`, then fill in the values (names only are listed)
3. `npx prisma db push && npx prisma generate`
4. `npm run dev`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.



---

# AI / Intelligence Pipeline (Person B — `src/lib/ai/`)

Scope: turn normalized `SourceRecord`s (written by Person A's Clio ingestion)
into ranked `CaseEvent`s and evidence-backed `Insight`s, incrementally, with
every claim traceable back to its source.

## Testing

```bash
npm test                                                   # 48 tests, no DB needed
$env:AI_USE_STUB="true"; npx tsx scripts/run-digest-fixture.ts   # full pipeline, no DB/API key needed
```

## Design rules this pipeline follows

- **Never reprocess everything.** Every `SourceRecord` carries a
  `contentHash`. If nothing changed since the last successful run, zero AI
  calls happen — the API just serves the existing `CaseEvent`/`Insight` rows.
- **Structured output only.** Every Gemini call is constrained to a Zod
  schema; invalid output is rejected and retried once, then logged as a
  failure rather than guessed at.
- **No invented facts.** Every `Insight` carries a confidence level
  (`observed | ai_synthesis | inferred | unknown`). If the evidence doesn't
  support a claim, it's labeled `unknown` rather than fabricated.
- **Events are additive; insights are a snapshot.** `CaseEvent`s accumulate
  over time (merged, never deleted); `Insight`s are fully re-synthesized
  each successful run — read them filtered to the matter's latest
  `digestVersion` (derived as `MAX(CaseEvent.digestVersion, Insight.digestVersion)`).
- **Convention for task due dates**: for `clioType === "task"` records,
  `occurredAt` is treated as the task's DUE date, not its creation date.

## Functions exposed for API routes

- `getTimeline(matterId)` — `src/lib/ai/timeline.ts`
- `getActions(matterId)` — `src/lib/ai/actions.ts`
