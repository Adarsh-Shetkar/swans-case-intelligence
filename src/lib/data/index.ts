// src/lib/data/index.ts
// DATA_SOURCE=clio reads Postgres (filled by POST /api/ingest); anything else serves mocks.
import * as m from "@/lib/mocks";
import * as live from "./live";

const isLive = () => process.env.DATA_SOURCE === "clio";

export const getPulse = async (id: string) => (isLive() ? live.getPulse(id) : m.pulse);
export const getDigest = async (id: string) => (isLive() ? live.getDigest(id) : m.digest);
export const getTimeline = async (id: string) => (isLive() ? live.getTimeline(id) : m.timeline);
export const getActions = async (id: string) => (isLive() ? live.getActions(id) : m.actions);
export const getEvidence = async (id: string, ids: string[]) =>
  isLive() ? live.getEvidence(id, ids) : m.evidence.filter((r) => ids.includes(r.id));
