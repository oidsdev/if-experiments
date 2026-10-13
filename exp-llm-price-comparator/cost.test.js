import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AS_OF,
  MODELS,
  compareRuns,
  costOfThousandRuns,
  dollarsToMicroPerMillion,
  formatListPrice,
  formatUsd,
  parseTokens,
} from "./prices.js";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const lib = readFileSync(new URL("./prices.js", import.meta.url), "utf8");
const page = html + app + css + lib;

function byId(id) {
  const model = MODELS.find(function (item) {
    return item.id === id;
  });
  assert.ok(model, id);
  return model;
}

test("stamp and monthly refresh are in the page", () => {
  assert.equal(AS_OF, "October 2026");
  assert.match(html, /Prices current as of October 2026\./);
  assert.match(html, /refreshed monthly/i);
  assert.match(html, /does not fetch live prices/);
  assert.match(html, /id="stamp"/);
});

test("page stays local", () => {
  assert.match(html, /connect-src 'none'/);
  assert.equal(/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|gtag\(|google-analytics/i.test(page), false);
  assert.match(html, /script type="module" src="app\.js"/);
  assert.match(html, /href="style\.css"/);
});

test("at least eight models, each with a provider pricing link", () => {
  assert.ok(MODELS.length >= 8);
  const ids = new Set();
  for (const model of MODELS) {
    assert.equal(ids.has(model.id), false);
    ids.add(model.id);
    assert.match(model.source, /^https:\/\/[^\s]+$/);
    assert.equal(model.name.length > 0, true);
    assert.equal(model.provider.length > 0, true);
    assert.equal(dollarsToMicroPerMillion(model.input) > 0n, true);
    assert.equal(dollarsToMicroPerMillion(model.output) > 0n, true);
  }
});

test("October 2026 list prices match the provider pages", () => {
  const expect = {
    "gpt-6-astra": ["10.00", "50.00", "https://developers.openai.com/api/docs/pricing"],
    "gpt-6-1-sol": ["2.00", "10.00", "https://developers.openai.com/api/docs/pricing"],
    "gpt-6-luna": ["0.10", "0.50", "https://developers.openai.com/api/docs/pricing"],
    "claude-opus-5-5": ["4", "20", "https://platform.claude.com/docs/en/about-claude/pricing"],
    "claude-sonnet-5-5": ["2", "10", "https://platform.claude.com/docs/en/about-claude/pricing"],
    "claude-haiku-5-5": ["0.10", "0.50", "https://platform.claude.com/docs/en/about-claude/pricing"],
    "gemini-3-8-flash": ["0.75", "3.75", "https://ai.google.dev/gemini-api/docs/pricing"],
    "gemini-3-1-pro-preview": ["2.00", "12.00", "https://ai.google.dev/gemini-api/docs/pricing"],
    "grok-4-7": ["2.00", "6.00", "https://docs.x.ai/developers/pricing"],
  };
  assert.equal(MODELS.length, Object.keys(expect).length);
  for (const [id, [input, output, source]] of Object.entries(expect)) {
    const model = byId(id);
    assert.equal(model.input, input);
    assert.equal(model.output, output);
    assert.equal(model.source, source);
  }
  assert.equal(formatListPrice("10.00"), "$10.00");
  assert.equal(formatListPrice("0.10"), "$0.10");
  assert.equal(formatListPrice("0.75"), "$0.75");
  assert.equal(formatListPrice("3.75"), "$3.75");
  assert.equal(formatListPrice("4"), "$4.00");
});

test("1,000-run cost is exact", () => {
  const luna = byId("gpt-6-luna");
  const lunaCost = costOfThousandRuns(luna, 1000n, 200n);
  assert.equal(formatUsd(lunaCost.numerator, lunaCost.scale), "$0.20");

  const flash = byId("gemini-3-8-flash");
  const flashCost = costOfThousandRuns(flash, 4000n, 1500n);
  assert.equal(formatUsd(flashCost.numerator, flashCost.scale), "$8.625");

  const astra = byId("gpt-6-astra");
  const astraCost = costOfThousandRuns(astra, 100000n, 20000n);
  assert.equal(formatUsd(astraCost.numerator, astraCost.scale), "$2,000.00");

  const zero = costOfThousandRuns(astra, 0n, 0n);
  assert.equal(formatUsd(zero.numerator, zero.scale), "$0.00");

  const one = costOfThousandRuns(byId("gpt-6-luna"), 1n, 0n);
  assert.equal(formatUsd(one.numerator, one.scale), "$0.0001");
});

test("same price sorts by name, cheapest first", () => {
  const rows = compareRuns(
    MODELS,
    1000n,
    1000n,
    ["gpt-6-1-sol", "claude-sonnet-5-5", "gpt-6-luna"]
  );
  assert.deepEqual(
    rows.map(function (row) {
      return row.model.name;
    }),
    ["GPT-6 Luna", "Claude Sonnet 5.5", "GPT-6.1 Sol"]
  );
  assert.equal(rows[1].text, rows[2].text);
  assert.equal(rows[0].numerator < rows[1].numerator, true);
});

test("token parser rejects junk and keeps whole numbers", () => {
  assert.deepEqual(parseTokens(" 1000 "), { ok: true, value: 1000n });
  assert.deepEqual(parseTokens("0"), { ok: true, value: 0n });
  assert.equal(parseTokens("").reason, "empty");
  assert.equal(parseTokens("  ").reason, "empty");
  assert.equal(parseTokens("10.5").reason, "invalid");
  assert.equal(parseTokens("-1").reason, "invalid");
  assert.equal(parseTokens("1e3").reason, "invalid");
  assert.equal(parseTokens("1_000").reason, "invalid");
  assert.equal(parseTokens("100000001").reason, "large");
  assert.equal(parseTokens(1000).reason, "invalid");
});
