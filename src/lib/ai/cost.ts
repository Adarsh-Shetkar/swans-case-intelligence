/**
 * Rough cost estimator for the submission's "approximate cost to run one
 * case" requirement. The brief explicitly says "rough numbers fine —
 * attorneys think per-case", so this is intentionally simple: per-token
 * pricing in, estimated dollars out.
 *
 * Defaults are placeholder approximations — override with your actual
 * current Gemini pricing via env vars for an accurate figure; don't quote
 * the defaults as authoritative.
 */
const INPUT_PRICE_PER_1M = Number(process.env.AI_INPUT_PRICE_PER_1M_TOKENS ?? 1.25);
const OUTPUT_PRICE_PER_1M = Number(process.env.AI_OUTPUT_PRICE_PER_1M_TOKENS ?? 5.0);

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;
  return Number((inputCost + outputCost).toFixed(4));
}
