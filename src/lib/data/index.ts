// src/lib/data/index.ts
import * as m from "@/lib/mocks";

const live = (): never => {
  throw new Error("DATA_SOURCE=clio is not wired yet (Person A/B)");
};
const isLive = () => process.env.DATA_SOURCE === "clio";

export const getPulse = async (_id: string) => (isLive() ? live() : m.pulse);
export const getDigest = async (_id: string) => (isLive() ? live() : m.digest);
export const getTimeline = async (_id: string) => (isLive() ? live() : m.timeline);
export const getActions = async (_id: string) => (isLive() ? live() : m.actions);
export const getEvidence = async (_id: string, ids: string[]) =>
  isLive() ? live() : m.evidence.filter((r) => ids.includes(r.id));