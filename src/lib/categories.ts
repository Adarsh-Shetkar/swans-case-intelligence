// src/lib/categories.ts
// One color per CaseEvent category, shared by the timeline and highlight cards.
const STYLES: Record<string, string> = {
  treatment: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  surgery: "bg-rose-50 text-rose-700 ring-rose-200",
  coverage: "bg-sky-50 text-sky-700 ring-sky-200",
  liability: "bg-violet-50 text-violet-700 ring-violet-200",
  discovery: "bg-amber-50 text-amber-800 ring-amber-200",
  experts: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  negotiation: "bg-teal-50 text-teal-700 ring-teal-200",
  communication: "bg-slate-100 text-slate-700 ring-slate-200",
  damages: "bg-orange-50 text-orange-700 ring-orange-200",
  records: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  deadline: "bg-red-50 text-red-700 ring-red-200",
};

export const categoryStyle = (c: string) => STYLES[c] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200";

// Importance 0-100 -> label and badge color.
export const importanceLevel = (n: number) =>
  n >= 85
    ? { label: "Critical", style: "bg-red-600 text-white" }
    : n >= 70
      ? { label: "High", style: "bg-orange-500 text-white" }
      : n >= 50
        ? { label: "Medium", style: "bg-amber-400 text-amber-950" }
        : { label: "Low", style: "bg-slate-200 text-slate-700" };
