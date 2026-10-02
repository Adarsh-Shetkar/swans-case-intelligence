import crypto from 'crypto';
import { db } from '@/lib/db';
import { getClioMatterBundle } from '@/lib/clio/client';
import { normalizeBundle } from './normalize';

export async function syncSapiniMatter() {
  // Fetch live matter data dynamically
  const bundle = await getClioMatterBundle();
  const clioMatter = bundle.matter;
  const matterId = String(clioMatter.id);

  // Extract financial KPIs dynamically from Clio custom fields if present
  const customFields = clioMatter.custom_field_values || [];
  const estimatedValueField = customFields.find((f: any) =>
    f.field_name?.toLowerCase().includes('estimated case value') ||
    f.field_name?.toLowerCase().includes('case value')
  );

  // Calculate raw snapshot hash based on record IDs and updated timestamps
  const snapshotContent = JSON.stringify({
    matterId,
    updatedAt: clioMatter.updated_at,
    noteCount: bundle.notes.length,
    commCount: bundle.communications.length,
    taskCount: bundle.tasks.length,
    calendarCount: bundle.calendarEntries.length,
    docCount: bundle.documents.length,
  });
  const rawSnapshotHash = crypto.createHash('sha256').update(snapshotContent).digest('hex');

  const matterData = {
    clioId: matterId,
    displayNumber: clioMatter.display_number || matterId,
    status: clioMatter.status || 'open',
    description: clioMatter.description || null,
    estimatedValue: estimatedValueField?.value ? { raw: estimatedValueField.value } : undefined,
    lastSyncedAt: new Date(),
    rawSnapshotHash,
  };

  // Upsert dynamic Matter record
  const matter = await db.matter.upsert({
    where: { id: matterId },
    update: matterData,
    create: { id: matterId, ...matterData },
  });

  // Normalize source records dynamically
  const sourceRecords = normalizeBundle(matter.id, bundle);

  // Upsert all source records into PostgreSQL in one transaction
  await db.$transaction(
    sourceRecords.map((record) =>
      db.sourceRecord.upsert({
        where: {
          matterId_clioType_clioId: {
            matterId: record.matterId,
            clioType: record.clioType,
            clioId: record.clioId,
          },
        },
        update: {
          occurredAt: record.occurredAt,
          author: record.author,
          subject: record.subject,
          excerpt: record.excerpt,
          rawContent: record.rawContent,
          contentHash: record.contentHash,
        },
        create: record,
      })
    )
  );

  return { matterId: matter.id, recordCount: sourceRecords.length, errors: bundle.errors };
}
