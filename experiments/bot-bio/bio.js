/** First line of every bio. Not optional, and not taken from the answers. */
export const DISCLOSURE = "I am an automated bot.";

export const LIMITS = {
  name: 80,
  does: 280,
  operator: 120,
};

export const LINE_NOTES = [
  "The disclosure. It is the first line, and it says this account is a bot.",
  "Puts the name under that line, so the name is not left to look like a person.",
  "Says what the bot does, so a reader knows what the messages are for.",
  "Names the person or company that runs the account.",
];

function asText(value) {
  return typeof value === "string" ? value : "";
}

function clean(value, max) {
  return asText(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

function hasWords(value) {
  return /[\p{L}\p{N}]/u.test(value);
}

function ensureEnd(value) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function capitalizeSentence(value) {
  if (/^[a-z]/.test(value) && !/^[a-z][A-Z]/.test(value)) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

function label(kind, value) {
  const text = clean(value, LIMITS[kind]);
  return hasWords(text) ? text : "";
}

function sentence(value) {
  const text = label("does", value);
  if (!text) return "";
  return ensureEnd(capitalizeSentence(text));
}

export function answerOk(kind, value) {
  if (kind === "does") return sentence(value) !== "";
  if (kind === "name" || kind === "operator") return label(kind, value) !== "";
  return false;
}

export function buildBio(input) {
  const name = label("name", input?.name);
  const does = sentence(input?.does);
  const operator = label("operator", input?.operator);
  if (!name || !does || !operator) return null;

  const lines = [
    DISCLOSURE,
    ensureEnd(`My name is ${name}`),
    does,
    ensureEnd(`${operator} runs this account`),
  ];

  if (lines[0] !== DISCLOSURE || lines.length !== LINE_NOTES.length) return null;
  return lines.join("\n\n");
}
