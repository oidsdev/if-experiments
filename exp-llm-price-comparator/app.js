import {
  MODELS,
  compareRuns,
  formatListPrice,
  parseTokens,
} from "./prices.js";

const priceBody = document.querySelector("#price-rows");
const picks = document.querySelector("#model-picks");
const inputEl = document.querySelector("#input-tokens");
const outputEl = document.querySelector("#output-tokens");
const errorEl = document.querySelector("#form-error");
const resultsEl = document.querySelector("#results");
const form = document.querySelector("#calc");

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenMessage(parsed, which) {
  if (parsed.ok || parsed.reason === "empty") return "";
  if (parsed.reason === "large") {
    const label = which.charAt(0).toUpperCase() + which.slice(1);
    return label + " tokens have to be 100,000,000 or fewer.";
  }
  return "Enter " + which + " tokens as a whole number, 0 or more.";
}

function renderPrices() {
  priceBody.replaceChildren();
  for (const model of MODELS) {
    const row = document.createElement("tr");
    row.innerHTML =
      "<th scope=\"row\">" +
      esc(model.name) +
      "<span class=\"api\">" +
      esc(model.apiId) +
      "</span></th>" +
      "<td class=\"num\">" +
      esc(formatListPrice(model.input)) +
      "</td>" +
      "<td class=\"num\">" +
      esc(formatListPrice(model.output)) +
      "</td>" +
      "<td>" +
      esc(model.rate) +
      "</td>" +
      "<td><a href=\"" +
      esc(model.source) +
      "\" rel=\"noreferrer\">" +
      esc(model.provider) +
      "</a></td>";
    priceBody.appendChild(row);
  }
}

function renderPicks() {
  picks.replaceChildren();
  for (const model of MODELS) {
    const label = document.createElement("label");
    label.innerHTML =
      "<input type=\"checkbox\" name=\"model\" value=\"" +
      esc(model.id) +
      "\" checked> " +
      "<span>" +
      esc(model.name) +
      "</span>";
    picks.appendChild(label);
  }
}

function selectedIds() {
  return Array.from(form.querySelectorAll("input[name=model]:checked")).map(
    function (box) {
      return box.value;
    }
  );
}

function showHint() {
  resultsEl.innerHTML = "<p class=\"quiet\">Enter both token counts.</p>";
}

function update() {
  const input = parseTokens(inputEl.value);
  const output = parseTokens(outputEl.value);
  const inputProblem = tokenMessage(input, "input");
  const outputProblem = tokenMessage(output, "output");

  if (inputProblem || outputProblem) {
    errorEl.textContent = inputProblem || outputProblem;
    resultsEl.replaceChildren();
    return;
  }

  if (!input.ok || !output.ok) {
    errorEl.textContent = "";
    showHint();
    return;
  }

  const ids = selectedIds();
  if (ids.length === 0) {
    errorEl.textContent = "Select at least one model.";
    resultsEl.replaceChildren();
    return;
  }

  errorEl.textContent = "";
  const rows = compareRuns(MODELS, input.value, output.value, ids);
  const body = rows
    .map(function (row) {
      return (
        "<tr><th scope=\"row\">" +
        esc(row.model.name) +
        "</th><td class=\"num\">" +
        esc(row.text) +
        "</td></tr>"
      );
    })
    .join("");
  resultsEl.innerHTML =
    "<table><caption>Cheapest first. List price for 1,000 runs.</caption>" +
    "<thead><tr><th scope=\"col\">Model</th><th class=\"num\" scope=\"col\">Cost</th></tr></thead>" +
    "<tbody>" +
    body +
    "</tbody></table>";
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  update();
});

form.addEventListener("input", update);

renderPrices();
renderPicks();
update();
