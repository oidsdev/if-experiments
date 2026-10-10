const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "card.js"), "utf8");
const context = {
  document: { getElementById() { return null; } },
  console
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(code, context);
const { buildCard, fileName } = context.JobCard;

test("empty card names the gap and tells the agent to stop", () => {
  const text = buildCard({});
  assert.match(text, /^JOB CARD\n\nJob: \(not yet\)\n\n/);
  assert.match(text, /If a step is not on this card, stop and ask\.\n$/);
  assert.equal(text.includes("Done when:"), false);
  assert.equal(text.includes("May touch:"), false);
  assert.equal(text.includes("Ask before:"), false);
});

test("filled card keeps the sections you wrote and drops the blanks", () => {
  const text = buildCard({
    job: "  Fix   the empty state  ",
    done: "- Empty list shows a message\nA full list still shows projects",
    may: "",
    mustNot: "Environment files",
    ask: ["Open or merge a pull request", ""],
    stop: "* A test fails for a reason outside this job",
    leave: ""
  });
  assert.match(text, /Job: Fix the empty state\n/);
  assert.match(text, /Done when:\n- Empty list shows a message\n- A full list still shows projects\n/);
  assert.match(text, /Must not touch:\n- Environment files\n/);
  assert.match(text, /Ask before:\n- Open or merge a pull request\n/);
  assert.match(text, /Stop if:\n- A test fails for a reason outside this job\n/);
  assert.equal(text.includes("May touch:"), false);
  assert.equal(text.includes("Leave behind:"), false);
  assert.equal(text.includes("- -"), false);
});

test("download name comes from the job", () => {
  assert.equal(fileName("Add an empty state to the projects page"), "add-an-empty-state-to-the-projects-page.txt");
  assert.equal(fileName("   "), "job-card.txt");
  assert.equal(fileName("Hello, world!"), "hello-world.txt");
});
