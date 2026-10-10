import { DISCLOSURE, LINE_NOTES, answerOk, buildBio } from "./bio.js";

const form = document.getElementById("flow");
const steps = [...form.querySelectorAll("[data-step]")];
const error = document.getElementById("error");
const result = document.getElementById("result");
const bioOut = document.getElementById("bio");
const why = document.getElementById("why");
const copyStatus = document.getElementById("copy-status");

const emptyErrors = [
  "Add the bot's name.",
  "Say what it does.",
  "Name who runs it.",
];

let current = 0;

function showStep(index) {
  current = index;
  steps.forEach((step, i) => {
    step.hidden = i !== index;
  });
  steps[index].querySelector("input").focus();
}

function advance() {
  const input = steps[current].querySelector("input");
  if (!input.value.trim()) {
    error.textContent = emptyErrors[current];
    input.focus();
    return;
  }
  if (!answerOk(input.name, input.value)) {
    error.textContent = "Use a few real words.";
    input.focus();
    return;
  }
  error.textContent = "";
  if (current < steps.length - 1) {
    showStep(current + 1);
    return;
  }
  publish();
}

function publish() {
  const bio = buildBio({
    name: document.getElementById("name").value,
    does: document.getElementById("does").value,
    operator: document.getElementById("operator").value,
  });
  const lines = bio ? bio.split("\n\n") : [];
  if (!bio || lines[0] !== DISCLOSURE || lines.length !== LINE_NOTES.length) {
    error.textContent = "Could not build a bio. Check the three answers.";
    return;
  }

  bioOut.textContent = bio;
  why.replaceChildren();
  lines.forEach((line, i) => {
    const item = document.createElement("li");
    const quote = document.createElement("p");
    quote.className = "line";
    quote.textContent = line;
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = LINE_NOTES[i];
    item.append(quote, note);
    why.append(item);
  });

  form.hidden = true;
  result.hidden = false;
  copyStatus.textContent = "";
  document.getElementById("result-title").focus();
}

async function copyBio() {
  const text = bioOut.textContent;
  let copied = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    const range = document.createRange();
    range.selectNodeContents(bioOut);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
  }
  copyStatus.textContent = copied ? "Copied." : "Select the bio and copy it.";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  advance();
});

form.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    error.textContent = "";
    if (current > 0) showStep(current - 1);
  });
});

document.getElementById("copy").addEventListener("click", copyBio);

document.getElementById("again").addEventListener("click", () => {
  result.hidden = true;
  form.hidden = false;
  copyStatus.textContent = "";
  error.textContent = "";
  showStep(0);
});
