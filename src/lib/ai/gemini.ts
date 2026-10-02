import { GoogleGenerativeAI } from "@google/generative-ai";
import type { z } from "zod";
import type { AiCallMeta, AiCallResult, CitableRecord } from "./types";
import { AiValidationError } from "./types";
import * as stub from "./stub";

const MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";
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

  const model = getClient().getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });

  const attempt = async (promptText: string) => {
    const result = await model.generateContent(promptText);
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
      model: MODEL,
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
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
      model: MODEL,
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      durationMs: Date.now() - started,
      usedStub: false,
    };
  }
}

export const config = { MODEL, USE_STUB };
