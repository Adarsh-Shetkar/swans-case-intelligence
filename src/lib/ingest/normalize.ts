import crypto from 'crypto';

export interface NormalizedSourceRecord {
  matterId: string;
  clioType: 'note' | 'communication' | 'task' | 'calendar' | 'document';
  clioId: string;
  occurredAt: Date;
  author: string | null;
  subject: string | null;
  excerpt: string | null;
  rawContent: string;
  contentHash: string;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function normalizeBundle(matterId: string, bundle: any): NormalizedSourceRecord[] {
  const records: NormalizedSourceRecord[] = [];

  // Notes
  (bundle.notes || []).forEach((n: any) => {
    const rawContent = n.detail || n.subject || '';
    records.push({
      matterId,
      clioType: 'note',
      clioId: String(n.id),
      occurredAt: new Date(n.date || n.created_at || Date.now()),
      author: n.author?.name || null,
      subject: n.subject || null,
      excerpt: rawContent ? rawContent.slice(0, 150) : null,
      rawContent,
      contentHash: computeHash(`note:${n.id}:${rawContent}`),
    });
  });

  // Communications
  (bundle.communications || []).forEach((c: any) => {
    const rawContent = c.body || c.subject || '';
    records.push({
      matterId,
      clioType: 'communication',
      clioId: String(c.id),
      occurredAt: new Date(c.date || c.created_at || Date.now()),
      author: c.senders?.[0]?.name || c.sender?.name || null,
      subject: c.subject || c.type || null,
      excerpt: rawContent ? rawContent.slice(0, 150) : null,
      rawContent,
      contentHash: computeHash(`comms:${c.id}:${rawContent}`),
    });
  });

  // Tasks
  (bundle.tasks || []).forEach((t: any) => {
    const rawContent = [t.name, t.status, t.description].filter(Boolean).join(' | ');
    records.push({
      matterId,
      clioType: 'task',
      clioId: String(t.id),
      occurredAt: new Date(t.due_at || t.created_at || Date.now()),
      author: t.assignee?.name || null,
      subject: t.name || null,
      excerpt: rawContent ? rawContent.slice(0, 150) : null,
      rawContent,
      contentHash: computeHash(`task:${t.id}:${rawContent}`),
    });
  });

  // Calendar Entries
  (bundle.calendarEntries || []).forEach((e: any) => {
    const rawContent = [e.summary, e.location, e.description].filter(Boolean).join(' | ');
    records.push({
      matterId,
      clioType: 'calendar',
      clioId: String(e.id),
      occurredAt: new Date(e.start_at || e.created_at || Date.now()),
      author: null,
      subject: e.summary || null,
      excerpt: rawContent ? rawContent.slice(0, 150) : null,
      rawContent,
      contentHash: computeHash(`calendar:${e.id}:${rawContent}`),
    });
  });

  // Documents
  (bundle.documents || []).forEach((d: any) => {
    const rawContent = [d.name, d.content_type].filter(Boolean).join(' | ');
    records.push({
      matterId,
      clioType: 'document',
      clioId: String(d.id),
      occurredAt: new Date(d.created_at || Date.now()),
      author: d.creator?.name || null,
      subject: d.name || null,
      excerpt: rawContent ? rawContent.slice(0, 150) : null,
      rawContent,
      contentHash: computeHash(`doc:${d.id}:${rawContent}`),
    });
  });

  return records;
}