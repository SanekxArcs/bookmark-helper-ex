// Thin client for the Gemini REST API with structured JSON output.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export const MODELS: { id: string; label: string; hint: string }[] = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'Most capable' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', hint: 'Agentic workflows' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', hint: 'Balanced' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', hint: 'High throughput' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', hint: 'Fastest, lowest cost' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', hint: 'Good value' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'Deep reasoning' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Hybrid reasoning' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', hint: 'Cost effective' },
];

// Models Google has retired, mapped to their closest live replacement so a
// value saved by an older version keeps working.
const RETIRED_MODELS: Record<string, string> = {
  'gemini-2.5-flash-lite-preview-09-2025': 'gemini-2.5-flash-lite',
};

export function resolveModel(model: string | undefined) {
  if (!model) return DEFAULT_MODEL;
  return RETIRED_MODELS[model] ?? model;
}

export type AIErrorKind = 'no-key' | 'auth' | 'quota' | 'model' | 'network' | 'response' | 'aborted';

export class AIError extends Error {
  constructor(
    message: string,
    readonly kind: AIErrorKind,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/** Subset of the OpenAPI schema Gemini accepts as `responseSchema`. */
export type Schema =
  | { type: 'STRING'; nullable?: boolean; description?: string }
  | { type: 'BOOLEAN'; nullable?: boolean; description?: string }
  | { type: 'ARRAY'; items: Schema; description?: string }
  | {
      type: 'OBJECT';
      properties: Record<string, Schema>;
      required?: string[];
      nullable?: boolean;
      description?: string;
    };

interface GenerateOptions {
  apiKey: string;
  model: string;
  prompt: string;
  schema: Schema;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}

export async function generateJSON<T>(opts: GenerateOptions): Promise<T> {
  if (!opts.apiKey) throw new AIError('Add your Gemini API key in Settings to use AI features.', 'no-key');

  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      responseMimeType: 'application/json',
      responseSchema: opts.schema,
    },
  });

  for (let attempt = 0; ; attempt++) {
    const res = await send(`/models/${resolveModel(opts.model)}:generateContent`, opts.apiKey, {
      method: 'POST',
      body,
      signal: opts.signal,
    });
    if (res.ok) return parseResponse<T>(await res.json());

    const retryable = res.status === 429 || res.status === 500 || res.status === 503;
    if (retryable && attempt < 2) {
      await sleep(1500 * 2 ** attempt, opts.signal);
      continue;
    }
    throw await toError(res, opts.model);
  }
}

/** Confirms the key works and the model exists, without spending tokens. */
export async function testConnection(apiKey: string, model: string) {
  if (!apiKey) throw new AIError('Enter an API key first.', 'no-key');
  const res = await send(`/models/${resolveModel(model)}`, apiKey, { method: 'GET' });
  if (!res.ok) throw await toError(res, model);
}

async function send(path: string, apiKey: string, init: RequestInit) {
  try {
    return await fetch(BASE_URL + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    });
  } catch (err) {
    if (init.signal?.aborted) throw new AIError('Cancelled.', 'aborted');
    throw new AIError("Couldn't reach Gemini. Check your internet connection.", 'network');
  }
}

async function toError(res: Response, model: string): Promise<AIError> {
  let message = '';
  try {
    message = (await res.json())?.error?.message ?? '';
  } catch {
    // Non-JSON error body; fall through to the status-based message.
  }
  if (res.status === 400 && /api key/i.test(message)) {
    return new AIError('Your Gemini API key was rejected. Check it in Settings.', 'auth');
  }
  if (res.status === 401 || res.status === 403) {
    return new AIError('Your Gemini API key was rejected. Check it in Settings.', 'auth');
  }
  if (res.status === 404) {
    return new AIError(`The model "${model}" isn't available for your key. Pick another one in Settings.`, 'model');
  }
  if (res.status === 429) {
    return new AIError('Gemini rate limit reached. Wait a minute and try again.', 'quota');
  }
  return new AIError(message || `Gemini returned an error (${res.status}).`, 'response');
}

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
}

function parseResponse<T>(data: GeminiResponse): T {
  if (data.promptFeedback?.blockReason) {
    throw new AIError('Gemini declined this request. Try different input.', 'response');
  }
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  const parsed = tryParse<T>(text);
  if (parsed !== undefined) return parsed;

  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new AIError('The AI response was cut off. Try again with fewer bookmarks.', 'response');
  }
  throw new AIError('The AI returned an unexpected response. Please try again.', 'response');
}

function tryParse<T>(text: string): T | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some models wrap JSON in prose or code fences; take the outermost object.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return undefined;
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      return undefined;
    }
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AIError('Cancelled.', 'aborted'));
      },
      { once: true },
    );
  });
}

export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}
