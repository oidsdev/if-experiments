const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const builder = require("./builder.js");

const dir = __dirname;

test("includes three Oids samples plus Stripe and generic", function () {
  const ids = builder.samples.map(function (sample) { return sample.id; });
  assert.deepEqual(ids, ["oids-message", "oids-post", "oids-like", "stripe-payment", "generic"]);
  const oids = builder.samples.filter(function (sample) { return sample.id.indexOf("oids-") === 0; });
  assert.equal(oids.length, 3);
  oids.forEach(function (sample) {
    const text = builder.sampleText(sample);
    assert.equal(builder.validateJson(text).ok, true, sample.id);
    const parsed = JSON.parse(text);
    assert.equal(typeof parsed.event, "string");
    assert.equal(parsed.event.length > 0, true);
  });
  assert.equal(JSON.parse(builder.sampleText(builder.samples[0])).event, "message.received");
  assert.equal(JSON.parse(builder.sampleText(builder.samples[3])).type, "payment_intent.succeeded");
});

test("samples contain no keys or signing secrets", function () {
  const blob = JSON.stringify(builder.samples);
  assert.equal(/sk_live|sk_test|whsec_|api_key|"oids_|Bearer|"secret"/i.test(blob), false);
});

test("valid JSON passes and invalid JSON names the line", function () {
  assert.equal(builder.validateJson('{\n  "ok": true\n}').ok, true);
  assert.deepEqual(builder.validateJson("   "), {
    ok: false,
    line: 1,
    column: 1,
    lineText: "   ",
    message: "Line 1: Payload is empty."
  });

  const missingValue = '{\n  "a": 1,\n  "b":\n}';
  const missing = builder.validateJson(missingValue);
  assert.equal(missing.ok, false);
  assert.equal(missing.line, 4);
  assert.equal(missing.column, 1);
  assert.match(missing.message, /^Line 4, column 1: /);
  assert.equal(missing.lineText, "}");

  const trailing = builder.validateJson('{"a": 1,}');
  assert.equal(trailing.ok, false);
  assert.equal(trailing.line, 1);
  assert.match(trailing.message, /Trailing comma/);

  const broken = builder.validateJson('{\n"a": true\n"b": false\n}');
  assert.equal(broken.ok, false);
  assert.equal(broken.line, 3);
  assert.match(broken.message, /comma or a closing brace/);
});

test("scanner agrees with JSON.parse", function () {
  const cases = [
    "{}",
    "[]",
    "0",
    "-0.1",
    "1e+2",
    "true",
    "false",
    "null",
    '"hi"',
    '"it\'s \\n fine"',
    '"\\u0041"',
    "[\n  1,\n  2\n]",
    '{"a":{"b":[1,2,3]}}',
    "  \n{\"a\": 1}\n  ",
    "",
    "{",
    "[",
    '{"a":1,}',
    "[1,]",
    '{"a":}',
    "{'a':1}",
    "01",
    "+1",
    '{"a":1} trailing',
    '"unterminated',
    '"bad \\x escape"',
    '"bad \\u12"',
    "{\"a\":1\n\"b\":2}",
    "undefined",
    "/* comment */ {}"
  ];
  cases.forEach(function (text) {
    var nativeOk = true;
    try {
      JSON.parse(text);
    } catch (e) {
      nativeOk = false;
    }
    var scan = builder.scanJson(text);
    assert.equal(scan.ok, nativeOk, JSON.stringify(text));
    if (!nativeOk && text.trim() !== "") {
      var result = builder.validateJson(text);
      assert.equal(result.ok, false);
      assert.match(result.message, /^Line \d+, column \d+: /);
      assert.equal(typeof result.line, "number");
      assert.equal(result.line >= 1, true);
    }
  });
});

test("curl command round-trips through the shell without calling the network", function () {
  const body = '{\n  "text": "it\'s a test $HOME `date`"\n}';
  const url = "https://example.com/hooks?x=1";
  const command = builder.buildCurl(url, body);
  assert.match(command, /^curl -X POST /);
  assert.equal(/Authorization|api[_-]?key|Bearer/i.test(command), false);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curl-fake-"));
  const fake = path.join(tmp, "curl");
  const capture = path.join(tmp, "args");
  fs.writeFileSync(fake, "#!/bin/sh\nprintf '%s\\0' \"$@\" > \"$CURL_CAPTURE\"\n");
  fs.chmodSync(fake, 0o755);
  execFileSync("/usr/bin/bash", ["-c", command], {
    env: { PATH: tmp, CURL_CAPTURE: capture },
    encoding: "utf8"
  });
  const raw = fs.readFileSync(capture);
  const args = [];
  let current = Buffer.alloc(0);
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === 0) {
      args.push(current.toString("utf8"));
      current = Buffer.alloc(0);
    } else {
      current = Buffer.concat([current, Buffer.from([raw[i]])]);
    }
  }
  if (current.length) args.push(current.toString("utf8"));
  fs.rmSync(tmp, { recursive: true, force: true });

  assert.deepEqual(args, [
    "-X",
    "POST",
    url,
    "-H",
    "Content-Type: application/json",
    "--data-binary",
    body
  ]);
});

test("endpoint helper rejects blanks, non-http, and userinfo", function () {
  assert.equal(builder.endpointError(""), "Add an endpoint URL.");
  assert.match(builder.endpointError("ftp://example.com"), /http/);
  assert.match(builder.endpointError("https://user:pass@example.com/hook"), /credentials/);
  assert.equal(builder.endpointError("https://example.com/webhooks"), null);
  assert.equal(builder.endpointError("http://localhost:8080/hook"), null);
});

test("page is static and does not attempt a request", function () {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const page = fs.readFileSync(path.join(dir, "page.js"), "utf8");
  const lib = fs.readFileSync(path.join(dir, "builder.js"), "utf8");
  const joined = html + "\n" + page + "\n" + lib;
  assert.match(html, /id="copy"/);
  assert.match(html, /src="builder.js"/);
  assert.match(html, /src="page.js"/);
  ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "gtag", "google-analytics"].forEach(function (token) {
    assert.equal(joined.indexOf(token), -1, token);
  });
  const urls = joined.match(/https?:\/\/[A-Za-z0-9][^\s"'<>)]*/g) || [];
  urls.forEach(function (url) {
    assert.match(url, /^https?:\/\/(ignitionfoundry\.com\/|example\.com|www\.w3\.org\/2000\/svg)/, url);
  });
});
