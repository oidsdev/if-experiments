/* Pure helpers for the webhook payload builder. No network. No DOM. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WebhookBuilder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var samples = [
    {
      id: "oids-message",
      label: "Oids message.received",
      body: {
        event: "message.received",
        id: "evt_oids_1042",
        created_at: "2026-10-10T14:05:00.000Z",
        data: {
          id: 1042,
          from: "station_keeper",
          to: "chief_of_staff",
          content: "Antenna check is clean. I logged it on the timeline.",
          created_at: "2026-10-10T14:05:00.000Z",
          read_at: null
        }
      }
    },
    {
      id: "oids-post",
      label: "Oids post.published",
      body: {
        event: "post.published",
        id: "evt_oids_88",
        created_at: "2026-10-10T14:06:00.000Z",
        data: {
          id: 88,
          username: "station_keeper",
          content: "Night watch is quiet. #station9",
          tags: ["station9"],
          like_count: 0,
          created_at: "2026-10-10T14:06:00.000Z"
        }
      }
    },
    {
      id: "oids-like",
      label: "Oids like.added",
      body: {
        event: "like.added",
        id: "evt_oids_like_88",
        created_at: "2026-10-10T14:07:00.000Z",
        data: {
          post_id: 88,
          username: "night_almanac",
          liked: true,
          like_count: 1
        }
      }
    },
    {
      id: "stripe-payment",
      label: "Stripe payment",
      body: {
        id: "evt_test_payload_builder",
        object: "event",
        type: "payment_intent.succeeded",
        livemode: false,
        created: 1760104800,
        data: {
          object: {
            id: "pi_test_payload_builder",
            object: "payment_intent",
            amount: 500,
            currency: "usd",
            status: "succeeded"
          }
        }
      }
    },
    {
      id: "generic",
      label: "Generic",
      body: {
        event: "ping",
        id: "evt_1",
        created_at: "2026-10-10T14:00:00.000Z",
        data: {
          note: "Replace this with the body you want to send."
        }
      }
    }
  ];

  function sampleText(sample) {
    return JSON.stringify(sample.body, null, 2);
  }

  function positionAt(text, index) {
    var line = 1;
    var column = 1;
    var i = 0;
    var end = index < text.length ? index : text.length;
    while (i < end) {
      if (text.charAt(i) === "\r") {
        line += 1;
        column = 1;
        if (text.charAt(i + 1) === "\n") i += 1;
      } else if (text.charAt(i) === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      i += 1;
    }
    return { line: line, column: column };
  }

  function scanJson(text) {
    var i = 0;
    var n = text.length;

    function fail(index, reason) {
      var p = positionAt(text, index);
      return { line: p.line, column: p.column, reason: reason };
    }

    function skipWs() {
      while (i < n) {
        var c = text.charAt(i);
        if (c === " " || c === "\t" || c === "\n" || c === "\r") i += 1;
        else break;
      }
    }

    function parseString() {
      var start = i;
      i += 1;
      while (i < n) {
        var c = text.charAt(i);
        var code = text.charCodeAt(i);
        if (c === '"') {
          i += 1;
          return null;
        }
        if (c === "\\") {
          i += 1;
          if (i >= n) return fail(start, "Unclosed string.");
          var e = text.charAt(i);
          if (e === '"' || e === "\\" || e === "/" || e === "b" || e === "f" || e === "n" || e === "r" || e === "t") {
            i += 1;
            continue;
          }
          if (e === "u") {
            var hex = text.slice(i + 1, i + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) return fail(i, "Bad unicode escape in string.");
            i += 5;
            continue;
          }
          return fail(i, "Bad escape in string.");
        }
        if (code < 0x20) return fail(i, "Control character in string.");
        i += 1;
      }
      return fail(start, "Unclosed string.");
    }

    function parseNumber() {
      var start = i;
      if (text.charAt(i) === "-") i += 1;
      if (i >= n || text.charAt(i) < "0" || text.charAt(i) > "9") return fail(start, "Expected a number.");
      if (text.charAt(i) === "0") {
        i += 1;
      } else {
        while (i < n && text.charAt(i) >= "0" && text.charAt(i) <= "9") i += 1;
      }
      if (text.charAt(i) === ".") {
        i += 1;
        var frac = i;
        while (i < n && text.charAt(i) >= "0" && text.charAt(i) <= "9") i += 1;
        if (i === frac) return fail(frac, "Expected digits after the decimal point.");
      }
      var expMark = text.charAt(i);
      if (expMark === "e" || expMark === "E") {
        i += 1;
        if (text.charAt(i) === "+" || text.charAt(i) === "-") i += 1;
        var exp = i;
        while (i < n && text.charAt(i) >= "0" && text.charAt(i) <= "9") i += 1;
        if (i === exp) return fail(exp, "Expected digits in the exponent.");
      }
      return null;
    }

    function parseLiteral(word) {
      if (text.slice(i, i + word.length) !== word) return fail(i, "Expected " + word + ".");
      var after = i + word.length;
      var next = text.charAt(after);
      if (next && /[A-Za-z0-9_]/.test(next)) return fail(i, "Unexpected token.");
      i = after;
      return null;
    }

    function parseValue() {
      skipWs();
      if (i >= n) return fail(i, "Unexpected end of JSON.");
      var c = text.charAt(i);
      if (c === "{") return parseObject();
      if (c === "[") return parseArray();
      if (c === '"') return parseString();
      if (c === "t") return parseLiteral("true");
      if (c === "f") return parseLiteral("false");
      if (c === "n") return parseLiteral("null");
      if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
      return fail(i, "Unexpected token '" + c + "'.");
    }

    function parseObject() {
      i += 1;
      skipWs();
      if (text.charAt(i) === "}") {
        i += 1;
        return null;
      }
      while (true) {
        skipWs();
        if (i >= n) return fail(i, "Unexpected end of JSON.");
        if (text.charAt(i) !== '"') return fail(i, "Expected a property name.");
        var err = parseString();
        if (err) return err;
        skipWs();
        if (i >= n) return fail(i, "Unexpected end of JSON.");
        if (text.charAt(i) !== ":") return fail(i, "Expected a colon.");
        i += 1;
        err = parseValue();
        if (err) return err;
        skipWs();
        if (text.charAt(i) === ",") {
          var comma = i;
          i += 1;
          skipWs();
          if (text.charAt(i) === "}") return fail(comma, "Trailing comma.");
          continue;
        }
        if (text.charAt(i) === "}") {
          i += 1;
          return null;
        }
        if (i >= n) return fail(i, "Unexpected end of JSON.");
        return fail(i, "Expected a comma or a closing brace.");
      }
    }

    function parseArray() {
      i += 1;
      skipWs();
      if (text.charAt(i) === "]") {
        i += 1;
        return null;
      }
      while (true) {
        var err = parseValue();
        if (err) return err;
        skipWs();
        if (text.charAt(i) === ",") {
          var comma = i;
          i += 1;
          skipWs();
          if (text.charAt(i) === "]") return fail(comma, "Trailing comma.");
          continue;
        }
        if (text.charAt(i) === "]") {
          i += 1;
          return null;
        }
        if (i >= n) return fail(i, "Unexpected end of JSON.");
        return fail(i, "Expected a comma or a closing bracket.");
      }
    }

    var err = parseValue();
    if (err) return { ok: false, line: err.line, column: err.column, reason: err.reason };
    skipWs();
    if (i < n) {
      var extra = positionAt(text, i);
      return {
        ok: false,
        line: extra.line,
        column: extra.column,
        reason: "Unexpected extra characters after JSON."
      };
    }
    return { ok: true };
  }

  function lineTextAt(text, line) {
    var parts = String(text).split(/\r\n|\n|\r/);
    return parts[line - 1] || "";
  }

  function validateJson(text) {
    var source = String(text);
    if (source.trim() === "") {
      return {
        ok: false,
        line: 1,
        column: 1,
        lineText: lineTextAt(source, 1),
        message: "Line 1: Payload is empty."
      };
    }

    var nativeOk = true;
    try {
      JSON.parse(source);
    } catch (e) {
      nativeOk = false;
    }

    var scan = scanJson(source);
    if (nativeOk) return { ok: true };
    if (!scan.ok) {
      return {
        ok: false,
        line: scan.line,
        column: scan.column,
        lineText: lineTextAt(source, scan.line),
        message: "Line " + scan.line + ", column " + scan.column + ": " + scan.reason
      };
    }
    return {
      ok: false,
      line: 1,
      column: 1,
      lineText: lineTextAt(source, 1),
      message: "Line 1: Invalid JSON."
    };
  }

  function endpointError(url) {
    if (url == null || String(url).trim() === "") return "Add an endpoint URL.";
    var value = String(url).trim();
    if (/[\r\n]/.test(value)) return "The endpoint URL cannot contain a line break.";
    if (/\s/.test(value)) return "The endpoint URL cannot contain spaces.";
    if (!/^https?:\/\/[^\s]+$/i.test(value)) return "Endpoint must start with http:// or https://.";
    if (/^https?:\/\/[^/]*@/i.test(value)) return "Leave credentials out of the URL.";
    return null;
  }

  function shSingle(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
  }

  function buildCurl(url, body) {
    return [
      "curl -X POST " + shSingle(url) + " \\",
      "  -H " + shSingle("Content-Type: application/json") + " \\",
      "  --data-binary " + shSingle(body)
    ].join("\n");
  }

  return {
    samples: samples,
    sampleText: sampleText,
    scanJson: scanJson,
    validateJson: validateJson,
    endpointError: endpointError,
    buildCurl: buildCurl
  };
});
