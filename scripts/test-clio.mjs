// Fetches the target matter from Clio and prints what came back. No DB writes.
// Usage: node --env-file=.env.local scripts/test-clio.mjs [matter query] [--full]
import { getClioMatterBundle } from '../src/lib/clio/client.ts';
import { normalizeBundle } from '../src/lib/ingest/normalize.ts';

const args = process.argv.slice(2);
const full = args.includes('--full');
const query = args.find((a) => !a.startsWith('--'));

const bundle = await getClioMatterBundle(query);
const { matter } = bundle;

console.log('\n=== Matter');
console.log({
  id: matter.id,
  display_number: matter.display_number,
  status: matter.status,
  description: matter.description,
  custom_fields: (matter.custom_field_values || []).map((f) => `${f.field_name}: ${f.value}`),
});

console.log('\n=== Counts');
for (const key of ['notes', 'communications', 'tasks', 'calendarEntries', 'documents']) {
  console.log(`${key.padEnd(16)} ${bundle[key].length}`);
  if (bundle[key].length) console.log('  first:', JSON.stringify(bundle[key][0]).slice(0, 300));
}

if (bundle.errors.length) {
  console.log('\n=== Errors');
  console.table(bundle.errors);
}

const records = normalizeBundle(String(matter.id), bundle);
const empty = records.filter((r) => !r.rawContent);
console.log(`\n=== Normalized: ${records.length} records, ${empty.length} with empty content`);
console.table(
  records.slice(0, full ? records.length : 10).map((r) => ({
    type: r.clioType,
    id: r.clioId,
    date: r.occurredAt.toISOString().slice(0, 10),
    author: r.author,
    subject: r.subject?.slice(0, 40),
  }))
);
