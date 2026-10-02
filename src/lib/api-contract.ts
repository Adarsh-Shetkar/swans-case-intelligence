// src/lib/api-contract.ts
export type Importance = number; // 0-100

export interface Pulse {
  client: { name: string; photoUrl?: string };
  posture: string;
  value?: { min?: number; max?: number; source: SourceRefLite };
  coverage?: number;
  specials?: number;
  expenses?: number;
  topRisk?: string;
}

export interface SourceRefLite { recordId: string; clioType: string }

export interface TimelineEvent {
  id: string; title: string; category: string; importance: Importance;
  summary: string; occurredAt: string; sourceRecordIds: string[];
}

export interface ActionItem {
  id: string; title: string; dueAt?: string; owner?: string; sourceRecordId?: string;
}
export interface Actions { overdue: ActionItem[]; upcoming: ActionItem[]; waitingOn: ActionItem[] }

export interface EvidenceRecord {
  id: string; clioType: string; occurredAt: string;
  author?: string; subject?: string; excerpt?: string; clioUrl?: string;
}

export interface ProviderShareConfig { visibleCategories: string[] }

// Routes
// GET  /api/matters/:id/pulse                  -> Pulse
// GET  /api/matters/:id/timeline               -> TimelineEvent[]
// GET  /api/matters/:id/actions                -> Actions
// GET  /api/matters/:id/evidence/:eventId      -> { sourceRecords: EvidenceRecord[] }
// GET  /api/matters/:id/provider-view?shareId= -> filtered pulse/timeline
// POST /api/matters/:id/provider-share         -> ProviderShareConfig (writes ONLY to our DB)