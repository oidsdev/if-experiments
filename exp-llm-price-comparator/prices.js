/* List prices copied in October 2026 from each model's source URL.
   Standard rates only: not batch, cached, flex, or fast mode.
   Refresh monthly. Do not fetch prices at runtime. */

export const AS_OF = "October 2026";
export const RUNS = 1000;
export const MAX_TOKENS = 100_000_000n;

const RUNS_BI = BigInt(RUNS);
const MICRO = 1_000_000n;
const SCALE = MICRO * MICRO;

export const MODELS = [
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    apiId: "gpt-6-astra",
    provider: "OpenAI",
    input: "10.00",
    output: "50.00",
    rate: "Standard. Prompts up to 272K input tokens.",
    source: "https://developers.openai.com/api/docs/pricing",
  },
  {
    id: "gpt-6-1-sol",
    name: "GPT-6.1 Sol",
    apiId: "gpt-6.1-sol",
    provider: "OpenAI",
    input: "2.00",
    output: "10.00",
    rate: "Standard. Prompts up to 272K input tokens.",
    source: "https://developers.openai.com/api/docs/pricing",
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    apiId: "gpt-6-luna",
    provider: "OpenAI",
    input: "0.10",
    output: "0.50",
    rate: "Standard. Prompts up to 272K input tokens.",
    source: "https://developers.openai.com/api/docs/pricing",
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    apiId: "claude-opus-5-5",
    provider: "Anthropic",
    input: "4",
    output: "20",
    rate: "Base input and output tokens.",
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    apiId: "claude-sonnet-5-5",
    provider: "Anthropic",
    input: "2",
    output: "10",
    rate: "Base input and output tokens.",
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
  },
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    apiId: "claude-haiku-5-5",
    provider: "Anthropic",
    input: "0.10",
    output: "0.50",
    rate: "Prompts up to 100,000 tokens.",
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
  },
  {
    id: "gemini-3-8-flash",
    name: "Gemini 3.8 Flash",
    apiId: "gemini-3.8-flash",
    provider: "Google",
    input: "0.75",
    output: "3.75",
    rate: "Paid standard through 31 Dec 2026. Output includes thinking tokens. Google lists $1.50 in and $7.50 out from 1 Jan 2027.",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    id: "gemini-3-1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    apiId: "gemini-3.1-pro-preview",
    provider: "Google",
    input: "2.00",
    output: "12.00",
    rate: "Paid standard, prompts up to 200K tokens. Output includes thinking tokens.",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    id: "grok-4-7",
    name: "Grok 4.7",
    apiId: "grok-4.7",
    provider: "xAI",
    input: "2.00",
    output: "6.00",
    rate: "Prompts under 200K tokens. At 200K and above, xAI lists $4.00 in and $12.00 out.",
    source: "https://docs.x.ai/developers/pricing",
  },
];

export function dollarsToMicroPerMillion(decimal) {
  if (typeof decimal !== "string" || !/^\d+(\.\d{1,6})?$/.test(decimal)) {
    throw new Error("Price must be a decimal string with at most 6 places.");
  }
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * MICRO + BigInt(fracPadded);
}

export function formatListPrice(decimal) {
  const micro = dollarsToMicroPerMillion(decimal);
  const whole = micro / MICRO;
  let frac = (micro % MICRO).toString().padStart(6, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return "$" + whole.toString() + "." + frac;
}

export function parseTokens(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (!/^\d+$/.test(text)) return { ok: false, reason: "invalid" };
  const value = BigInt(text);
  if (value > MAX_TOKENS) return { ok: false, reason: "large" };
  return { ok: true, value };
}

/* Cost in dollars is numerator / scale.
   scale is 1e12. Prices are stored as microdollars per 1M tokens,
   so runs * tokens * priceMicro / 1e6 / 1e6 stays an integer. */
export function costOfThousandRuns(model, inputTokens, outputTokens) {
  const pin = dollarsToMicroPerMillion(model.input);
  const pout = dollarsToMicroPerMillion(model.output);
  const numerator =
    RUNS_BI * (BigInt(inputTokens) * pin + BigInt(outputTokens) * pout);
  return { numerator, scale: SCALE };
}

export function formatUsd(numerator, scale) {
  if (typeof numerator !== "bigint" || typeof scale !== "bigint") {
    throw new Error("formatUsd expects bigints.");
  }
  if (numerator < 0n || scale <= 0n) {
    throw new Error("formatUsd expects a non-negative amount.");
  }
  const digits = scale.toString().length - 1;
  const whole = numerator / scale;
  const rem = numerator % scale;
  let frac = rem.toString().padStart(digits, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "$" + grouped + "." + frac;
}

export function compareRuns(models, inputTokens, outputTokens, selectedIds) {
  const wanted = new Set(selectedIds);
  const rows = [];
  for (const model of models) {
    if (!wanted.has(model.id)) continue;
    const cost = costOfThousandRuns(model, inputTokens, outputTokens);
    rows.push({
      model,
      numerator: cost.numerator,
      scale: cost.scale,
      text: formatUsd(cost.numerator, cost.scale),
    });
  }
  rows.sort(function (a, b) {
    if (a.numerator < b.numerator) return -1;
    if (a.numerator > b.numerator) return 1;
    if (a.model.name < b.model.name) return -1;
    if (a.model.name > b.model.name) return 1;
    return 0;
  });
  return rows;
}
