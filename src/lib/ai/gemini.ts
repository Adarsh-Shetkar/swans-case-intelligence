import { GoogleGenerativeAI } from "@google/generative-ai";
import type { z } from "zod";
import type { AiCallMeta, AiCallResult, CitableRecord } from "./types";
import { AiValidationError } from "./types";
import * as stub from "./stub";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Used only when the primary model stays overloaded after retries.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";
const RETRY_DELAYS_MS = [2000, 6000];
const USE_STUB = process.env.AI_USE_STUB === "true" || !process.env.GEMINI_API_KEY;

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI {
  if (!client) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY is not set and AI_USE_STUB is not enabled — set one or the other."
      );
    }
    client = new GoogleGenerativeAI(key);
  }
  return client;
}

function isTransient(err: unknown): boolean {
  return /\[(429|500|502|503|504) /.test(String(err)) || /overloaded|high demand/i.test(String(err));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Rides out provider overload (429/5xx): retries the primary model with
 * backoff, then tries the fallback model once. Non-transient errors throw
 * immediately.
 */
async function generateWithRetry(promptText: string) {
  const models = FALLBACK_MODEL && FALLBACK_MODEL !== MODEL ? [MODEL, FALLBACK_MODEL] : [MODEL];
  let lastErr: unknown;
  for (const name of models) {
    const model = getClient().getGenerativeModel({
      model: name,
      generationConfig: { responseMimeType: "application/json" },
    });
    const delays = name === MODEL ? RETRY_DELAYS_MS : [];
    for (let i = 0; i <= delays.length; i++) {
      try {
        return { result: await model.generateContent(promptText), model: name };
      } catch (err) {
        if (!isTransient(err)) throw err;
        lastErr = err;
        if (i < delays.length) await sleep(delays[i]);
      }
    }
  }
  throw lastErr;
}

// Thinking models bill their reasoning tokens as output, on top of the visible answer.
function outputTokenCount(usage: { candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined) {
  if (!usage) return undefined;
  return (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1] : trimmed;
}

/**
 * The single entry point every pipeline stage calls to get structured,
 * schema-validated output from Gemini (or the deterministic stub).
 *
 * Contract:
 *  - Real calls use Gemini's JSON response mode, then re-validate with the
 *    given Zod schema (never trust the model's own claim of validity).
 *  - On schema failure, we retry exactly once with the validation error fed
 *    back to the model. A second failure throws AiValidationError — callers
 *    are expected to catch this, log a failed ProcessingJob, and skip that
 *    stage rather than crash the whole digest run (see lib/ai/digest.ts).
 *  - Stub mode produces output from the SAME `records` input via simple
 *    heuristics (lib/ai/stub.ts), then runs it through the identical schema
 *    validation path, so stub and real runs exercise the exact same
 *    downstream contract.
 */
export async function generateStructured<T>(args: {
  prompt: string;
  schema: z.ZodType<T>;
  meta: AiCallMeta;
  records?: CitableRecord[]; // only consulted in stub mode
}): Promise<AiCallResult<T>> {
  const { prompt, schema, meta, records } = args;
  const started = Date.now();

  if (USE_STUB) {
    const raw = stub.run(meta.stage, records ?? []);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      // A stub/schema mismatch is a bug in our own code, not an AI failure —
      // fail loudly rather than silently serving invalid data.
      throw new AiValidationError("stub output failed schema validation", parsed.error.issues);
    }
    return {
      data: parsed.data,
      model: "stub",
      durationMs: Date.now() - started,
      usedStub: true,
    };
  }

  let modelUsed = MODEL;

  const attempt = async (promptText: string) => {
    const { result, model } = await generateWithRetry(promptText);
    modelUsed = model;
    const text = stripCodeFence(result.response.text());

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      throw new AiValidationError("model did not return valid JSON", { raw: text.slice(0, 500) });
    }

    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new AiValidationError("model output failed schema validation", parsed.error.issues);
    }

    return { data: parsed.data, usage: result.response.usageMetadata };
  };

  try {
    const { data, usage } = await attempt(prompt);
    return {
      data,
      model: modelUsed,
      inputTokens: usage?.promptTokenCount,
      outputTokens: outputTokenCount(usage),
      durationMs: Date.now() - started,
      usedStub: false,
    };
  } catch (firstErr) {
    const issueSummary =
      firstErr instanceof AiValidationError
        ? JSON.stringify(firstErr.issues).slice(0, 1500)
        : String(firstErr);

    const correctivePrompt = `${prompt}\n\n---\nYour previous response was invalid: ${issueSummary}\nReturn ONLY corrected JSON matching the required schema. No prose, no code fences.`;

    // Let a second failure propagate — the caller logs it and moves on.
    const { data, usage } = await attempt(correctivePrompt);
    return {
      data,
      model: modelUsed,
      inputTokens: usage?.promptTokenCount,
      outputTokens: outputTokenCount(usage),
      durationMs: Date.now() - started,
      usedStub: false,
    };
  }
}

export const config = { MODEL, FALLBACK_MODEL, USE_STUB };
