const CLIO_BASE_URL = process.env.CLIO_API_BASE_URL || 'https://app.clio.com/api/v4';
const TOKEN = process.env.CLIO_ACCESS_TOKEN;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// Clio v4 only returns id/etag unless fields are requested explicitly.
const FIELDS = {
  matter: 'id,display_number,status,description,updated_at,client{name},custom_field_values{id,value,field_name,field_type}',
  note: 'id,subject,detail,date,created_at,author{name}',
  communication: 'id,subject,body,type,date,created_at,senders{name},receivers{name}',
  task: 'id,name,description,status,due_at,created_at,assignee{name}',
  calendarEntry: 'id,summary,description,location,start_at,created_at',
  document: 'id,name,content_type,created_at,updated_at,creator{name}',
};

function withParams(endpoint: string, params: Record<string, string>): string {
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}${new URLSearchParams(params).toString()}`;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Clio API Error (${res.status}): ${res.statusText} on ${url.replace(CLIO_BASE_URL, '')} — ${body}`);
  }
  return res.json();
}

// Follows meta.paging.next until all pages are fetched.
async function fetchClio<T>(endpoint: string, fields: string): Promise<T[]> {
  let url: string | undefined = `${CLIO_BASE_URL}${withParams(endpoint, { fields, limit: '200' })}`;
  const results: T[] = [];
  while (url) {
    const json = await getJson(url);
    results.push(...((json.data || []) as T[]));
    url = json.meta?.paging?.next;
  }
  return results;
}

async function fetchClioSingle<T>(endpoint: string, fields: string): Promise<T> {
  const json = await getJson(`${CLIO_BASE_URL}${withParams(endpoint, { fields })}`);
  return json.data as T;
}

export interface ClioRawBundle {
  matter: any;
  notes: any[];
  communications: any[];
  tasks: any[];
  calendarEntries: any[];
  documents: any[];
  errors: { resource: string; message: string }[];
}

export async function getClioMatterBundle(query = process.env.CLIO_TARGET_MATTER_QUERY || 'Sapini'): Promise<ClioRawBundle> {
  if (!TOKEN) {
    throw new Error('CLIO_ACCESS_TOKEN is not set.');
  }

  // 1. Search for the matter in Clio
  const json = await getJson(`${CLIO_BASE_URL}${withParams('/matters.json', { query, fields: 'id' })}`);
  const matterSummary = json.data?.[0];

  if (!matterSummary) {
    throw new Error(`No matter found matching query "${query}" in the connected Clio account.`);
  }

  const matterId = String(matterSummary.id);
  const errors: ClioRawBundle['errors'] = [];

  // Related resources are optional: record the failure instead of failing the whole sync.
  const optional = <T>(resource: string, p: Promise<T[]>) =>
    p.catch((e: Error) => {
      console.error(`Clio ${resource} fetch failed:`, e.message);
      errors.push({ resource, message: e.message });
      return [] as T[];
    });

  // 2. Fetch full matter details & related resources in parallel
  const [matter, notes, communications, tasks, calendarEntries, documents] = await Promise.all([
    fetchClioSingle<any>(`/matters/${matterId}.json`, FIELDS.matter),
    optional('notes', fetchClio<any>(withParams('/notes.json', { matter_id: matterId, type: 'Matter' }), FIELDS.note)),
    optional('communications', fetchClio<any>(withParams('/communications.json', { matter_id: matterId }), FIELDS.communication)),
    optional('tasks', fetchClio<any>(withParams('/tasks.json', { matter_id: matterId }), FIELDS.task)),
    optional('calendarEntries', fetchClio<any>(withParams('/calendar_entries.json', { matter_id: matterId }), FIELDS.calendarEntry)),
    optional('documents', fetchClio<any>(withParams('/documents.json', { matter_id: matterId }), FIELDS.document)),
  ]);

  return { matter, notes, communications, tasks, calendarEntries, documents, errors };
}
