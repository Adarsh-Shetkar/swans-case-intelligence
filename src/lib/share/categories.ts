import type { ShareCategory } from "@/lib/api-contract";

export const SHARE_CATEGORIES: { key: ShareCategory; label: string; hint: string; defaultOn: boolean }[] = [
  { key: "status", label: "Case status", hint: "Open or closed, plus date of last activity", defaultOn: true },
  { key: "coverage", label: "Coverage", hint: "Insurance coverage behind the case", defaultOn: true },
  { key: "requests", label: "Requests to the provider", hint: "What the firm needs from their office", defaultOn: true },
  { key: "treatment", label: "Treatment updates", hint: "Treatment-related events", defaultOn: false },
  { key: "records", label: "Records activity", hint: "Records requested and received", defaultOn: false },
  { key: "bills", label: "Medical bills total", hint: "Total medical specials to date", defaultOn: false },
  { key: "dates", label: "Upcoming dates", hint: "Items tagged for the provider", defaultOn: false },
];

export const SHARE_KEYS = SHARE_CATEGORIES.map((c) => c.key) as [ShareCategory, ...ShareCategory[]];