const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CLEANUP_TIMEOUT_MS = 15_000;

export const DEFAULT_LLM_MODEL = "openai/gpt-5-nano";
export const DEFAULT_LLM_PROMPT =
  "Clean up the following voice transcription. Fix punctuation, capitalisation, and obvious speech errors. Return only the corrected text, nothing else.";

export interface LlmCleanupConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
  prompt: string;
}

export function readLlmCleanupConfig(): LlmCleanupConfig {
  return {
    enabled: localStorage.getItem("verba_llm_enabled") === "true",
    apiKey:
      localStorage.getItem("verba_llm_api_key") ??
      (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) ??
      "",
    model: localStorage.getItem("verba_llm_model") || DEFAULT_LLM_MODEL,
    prompt: localStorage.getItem("verba_llm_prompt") || DEFAULT_LLM_PROMPT,
  };
}

export function isLlmCleanupEnabled(): boolean {
  return readLlmCleanupConfig().enabled;
}

/**
 * Polish a transcript through OpenRouter. Returns null whenever cleanup
 * cannot or should not run — callers must fall back to the raw text.
 */
export async function cleanupTranscript(
  text: string,
  config: LlmCleanupConfig = readLlmCleanupConfig()
): Promise<string | null> {
  if (!config.enabled || !config.apiKey || !text.trim()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLEANUP_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: config.prompt },
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const cleaned = data?.choices?.[0]?.message?.content;
    if (typeof cleaned !== "string" || !cleaned.trim()) return null;
    return cleaned.trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
