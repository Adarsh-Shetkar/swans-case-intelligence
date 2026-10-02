// src/lib/format.ts
import { formatDistanceToNowStrict, format } from "date-fns";

export const money = (n?: number) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
export const day = (iso: string) => format(new Date(iso), "MMM d, yyyy");
export const month = (iso: string) => format(new Date(iso), "MMMM yyyy");