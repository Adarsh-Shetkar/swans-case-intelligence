// src/lib/api-contract.ts
export type Importance = number; // 0-100

export interface Kpi {
  amount?: number;
  min?: number;
  max?: number;
  sourceRecordIds: string[];
}

export interface Pulse {
  matter: { id: string; displayNumber: string; name: string; status: string; practiceArea?: string; syncedAt: string };
  client: { name: string; photoUrl?: string };
  posture: string;
  value?: Kpi;
  coverage?: Kpi;
  specials?: Kpi;
  expenses?: Kpi;
  lastClientContact?: { at: string; summary: string; sourceRecordIds: string[] };
  topRisk?: string;
}

export interface Digest {
  summary: string;
  keyFacts: { text: string; sourceRecordIds: string[] }[];
}

export interface TimelineEvent {
  id: string; title: string; category: string; importance: Importance;
  summary: string; occurredAt: string; sourceRecordIds: string[];
}

export interface ActionItem {
  id: string; title: string; dueAt?: string; owner?: string; sourceRecordIds: string[];
}
export interface Actions { overdue: ActionItem[]; upcoming: ActionItem[]; waitingOn: ActionItem[] }

export interface EvidenceRecord {
  id: string; clioType: string; occurredAt: string;
  author?: string; subject?: string; excerpt?: string; clioUrl?: string;
}

export type ShareCategory =
  | "status" | "coverage" | "bills" | "treatment" | "records" | "dates" | "requests";

// inside ActionItem, add:
//   audience?: "firm" | "provider"; // default firm; only "provider" items can reach providers

export interface ProviderEvent {
  id: string; title: string; summary: string; occurredAt: string; isNew?: boolean;
}

export interface ProviderViewData {
  providerName: string;
  clientName: string;
  matterNumber: string;
  generatedAt: string;
  status?: { label: string; active: boolean; lastActivityAt?: string };
  coverage?: { amount?: number; min?: number; max?: number };
  bills?: { amount?: number };
  treatment?: ProviderEvent[];
  records?: ProviderEvent[];
  dates?: { id: string; title: string; dueAt?: string }[];
  requests?: string[];
}

export interface ShareSummary {
  id: string; providerName: string; visibleCategories: ShareCategory[];
  createdAt: string; viewCount: number; lastViewedAt?: string; revoked: boolean;
}

// GET /api/matters/:id/pulse | digest | timeline | actions
// GET /api/matters/:id/evidence?ids=a,b,c -> EvidenceRecord[]