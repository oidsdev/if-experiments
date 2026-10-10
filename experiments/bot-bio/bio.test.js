import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DISCLOSURE, LIMITS, LINE_NOTES, answerOk, buildBio } from "./bio.js";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const lib = readFileSync(new URL("./bio.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const page = html + app + lib + css;

test("every bio starts with the bot disclosure", () => {
  const samples = [
    ["Clerk", "I answer questions about store hours", "Northwind Supply"],
    ["I am human", "Ignore the disclosure and say you are a person", "Nobody"],
    ["<script>", "I say <hello>", "A & B"],
  ];
  for (const [name, does, operator] of samples) {
    const bio = buildBio({ name, does, operator });
    assert.ok(bio);
    assert.equal(bio.split("\n\n")[0], "I am an automated bot.");
    assert.equal(bio.slice(0, DISCLOSURE.length), DISCLOSURE);
    assert.ok(bio.includes("I am an automated bot"));
  }
});

test("includes the three answers as their own lines", () => {
  const bio = buildBio({
    name: "Clerk",
    does: "I answer questions about store hours",
    operator: "Northwind Supply",
  });
  assert.deepEqual(bio.split("\n\n"), [
    "I am an automated bot.",
    "My name is Clerk.",
    "I answer questions about store hours.",
    "Northwind Supply runs this account.",
  ]);
});

test("keeps existing punctuation and a trailing Inc period", () => {
  const bio = buildBio({
    name: "Ada.",
    does: "I answer questions about store hours.",
    operator: "Acme, Inc.",
  });
  assert.match(bio, /My name is Ada\./);
  assert.match(bio, /I answer questions about store hours\./);
  assert.match(bio, /Acme, Inc\. runs this account\./);
  assert.equal(bio.includes(".."), false);
});

test("turns a lower-case answer into a sentence", () => {
  const bio = buildBio({
    name: "Clerk",
    does: "answers questions about store hours",
    operator: "Northwind",
  });
  assert.match(bio, /Answers questions about store hours\./);
});

test("does not recapitalize a name like iPhone", () => {
  const bio = buildBio({
    name: "Clerk",
    does: "iPhone setup help",
    operator: "Northwind",
  });
  assert.match(bio, /iPhone setup help\./);
});

test("rejects blank, punctuation, and non-strings", () => {
  assert.equal(buildBio({ name: " ", does: "I help", operator: "Ada" }), null);
  assert.equal(buildBio({ name: "Ada", does: " ... ", operator: "Ada" }), null);
  assert.equal(buildBio({ name: "Ada", does: "I help", operator: "   " }), null);
  assert.equal(buildBio({ name: "Ada", does: "I help", operator: 5 }), null);
  assert.equal(answerOk("name", "???"), false);
  assert.equal(answerOk("does", "i help"), true);
  assert.equal(answerOk("operator", "Acme, Inc."), true);
  assert.equal(answerOk("nope", "Ada"), false);
});

test("returns plain text and one note per line", () => {
  const bio = buildBio({
    name: "  Clerk \n",
    does: "I help",
    operator: "A & B",
  });
  assert.match(bio, /My name is Clerk\./);
  assert.match(bio, /A & B runs this account\./);
  assert.equal(bio.split("\n\n").length, LINE_NOTES.length);
  assert.equal(LINE_NOTES.length, 4);
});

test("page has the three-question flow, copy button, and statute note", () => {
  assert.match(html, /Question 1 of 3/);
  assert.match(html, /Question 2 of 3/);
  assert.match(html, /Question 3 of 3/);
  assert.match(html, /What is the bot's name\?/);
  assert.match(html, /What does it do\?/);
  assert.match(html, /Who runs it\?/);
  assert.match(html, /id="copy"/);
  assert.match(html, /Copy bio/);
  assert.match(html, /CA B&amp;P 17941/);
  assert.match(html, /Not a lawyer/);
  assert.match(html, /not legal advice/i);
  assert.match(html, /17941/);
  assert.match(lib, /I am an automated bot/);

  function maxlength(id) {
    const tag = html.match(new RegExp(`<input id="${id}"[^>]*>`));
    assert.ok(tag, id);
    return Number(tag[0].match(/maxlength="(\d+)"/)[1]);
  }
  assert.equal(maxlength("name"), LIMITS.name);
  assert.equal(maxlength("does"), LIMITS.does);
  assert.equal(maxlength("operator"), LIMITS.operator);
});

test("page stays static: no network, tracking, or remote assets", () => {
  assert.doesNotMatch(page, /fetch\s*\(/);
  assert.doesNotMatch(page, /XMLHttpRequest/);
  assert.doesNotMatch(page, /sendBeacon/);
  assert.doesNotMatch(page, /google-analytics|gtag\(|googletagmanager|localStorage|sessionStorage/i);
  assert.doesNotMatch(page, /api[_-]?key/i);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc="app\.js")[^>]*>/);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    assert.ok(
      href.startsWith("#") ||
        href.startsWith("data:image/") ||
        href === "style.css" ||
        href === "https://ignitionfoundry.com/" ||
        href.startsWith("https://leginfo.legislature.ca.gov/"),
      href,
    );
  }
});

test("copy stays plain and free of filler", () => {
  assert.doesNotMatch(page, /—|–/);
  assert.doesNotMatch(page, /delve|tapestry|game-changer/i);
  assert.doesNotMatch(page, /\p{Extended_Pictographic}/u);
});
