/* Skill Scorer rubric. Pure and deterministic: same text, same score.
   Point values are the contract covered by score.test.js. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SkillScorer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SAMPLE_SKILL = [
    '---',
    'name: pdf-notes',
    'description: Pulls headings and quotes out of a PDF and writes a one-page brief. Use this when the user hands you a PDF and wants a summary they can skim.',
    '---',
    '',
    '# PDF notes',
    '',
    '## Steps',
    '',
    '1. Confirm the path the user gave you.',
    '2. Extract the text with the command below.',
    '3. Write five bullets and one pull quote.',
    '',
    '## Examples',
    '',
    'For example, a 12-page paper becomes five bullets and a quote.',
    '',
    '```bash',
    'pdftotext -layout paper.pdf - | head -n 200',
    '```',
    '',
    '```bash',
    'pdftotext -layout notes.pdf brief.txt',
    '```',
    '',
    '## Secrets',
    '',
    'Never paste API keys, credentials, or secrets into the brief. If a tool needs a key, read it from an environment variable.',
    ''
  ].join('\n');

  var PLACEHOLDER_RE = /\bYOUR_[A-Z0-9_]+\b|\bREPLACE_ME\b|\bINSERT_[A-Z0-9_]+\b|\bchangeme\b|\bxxx+\b|<(?:your|my)[-_ ][^>\n]{0,40}>|<(?:api[_-]?key|token|secret|password|placeholder|key|path|file|filename|name|user|username)>/i;

  var KEY_SOURCES = [
    '\\bA[KS]IA[0-9A-Z]{16}\\b',
    '\\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\\b',
    '\\brk-[A-Za-z0-9_-]{20,}\\b',
    '\\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\\b',
    '\\bgh[pousr]_[A-Za-z0-9]{20,}\\b',
    '\\bgithub_pat_[A-Za-z0-9_]{20,}\\b',
    '\\bxox[baprs]-[A-Za-z0-9-]{10,}',
    '-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----',
    '\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b',
    '\\bAIza[0-9A-Za-z_-]{35}\\b',
    '\\b(?:api[_ -]?keys?|apikey|secrets?|passwords?|passwd|access[_ -]?keys?|auth[_ -]?tokens?)\\b\\s*[:=]\\s*[\'"][^\'"\\n]{16,}[\'"]'
  ];

  var KEY_OK = /example|placeholder|your[_-]|changeme|redacted|dummy|fake|xxxx+|sample/i;

  function normalize(input) {
    if (input == null) return '';
    return String(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  function collapse(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function check(label, score, max) {
    return { label: label, score: score, max: max };
  }

  function category(id, label, checks, fix) {
    var score = 0;
    for (var i = 0; i < checks.length; i++) score += checks[i].score;
    return {
      id: id,
      label: label,
      score: score,
      max: 100,
      fix: fix,
      checks: checks
    };
  }

  function bestFix(candidates) {
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].missing <= 0) continue;
      if (!best || candidates[i].missing > best.missing) best = candidates[i];
    }
    return best ? best.fix : '';
  }

  function blankResult() {
    var fix = 'Paste a SKILL.md or CLAUDE.md.';
    return {
      total: 0,
      categories: [
        category('clarity', 'Clarity', [
          check('Description', 0, 40),
          check('Sections', 0, 30),
          check('Concrete detail', 0, 30)
        ], fix),
        category('examples', 'Examples', [
          check('Code blocks', 0, 50),
          check('Copy-pasteable', 0, 50)
        ], fix),
        category('safety', 'Safety', [
          check('Secrets warning', 0, 50),
          check('No hardcoded keys', 0, 50)
        ], fix)
      ]
    };
  }

  function splitFrontmatter(text) {
    if (text.indexOf('---\n') !== 0) return { yaml: '', body: text };
    var end = text.indexOf('\n---\n', 4);
    if (end === -1) {
      if (text.length >= 4 && text.lastIndexOf('\n---') === text.length - 4) {
        return { yaml: text.slice(4, text.length - 4), body: '' };
      }
      return { yaml: '', body: text };
    }
    return { yaml: text.slice(4, end), body: text.slice(end + 5) };
  }

  function extractDescription(yaml) {
    if (!yaml) return '';
    var lines = yaml.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^description:[ \t]*(.*)$/);
      if (!m) continue;
      var value = m[1].trim();
      if (
        value === '' ||
        value === '>' ||
        value === '|' ||
        value === '>-' ||
        value === '|-' ||
        value === '>+' ||
        value === '|+'
      ) {
        var parts = [];
        for (var j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() === '') {
            parts.push('');
            continue;
          }
          if (!/^[ \t]/.test(lines[j])) break;
          parts.push(lines[j].trim());
        }
        return collapse(parts.join(' '));
      }
      if (
        (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")
      ) {
        value = value.slice(1, -1);
      }
      return collapse(value);
    }
    return '';
  }

  function splitFences(body) {
    var lines = body.split('\n');
    var proseParts = [];
    var blocks = [];
    var inFence = false;
    var fenceChar = '';
    var fenceLen = 0;
    var lang = '';
    var buf = [];
    var proseBuf = [];

    function flushProse() {
      proseParts.push(proseBuf.join('\n'));
      proseBuf = [];
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!inFence) {
        var open = line.match(/^[ ]{0,3}(`{3,}|~{3,})(.*)$/);
        if (open) {
          flushProse();
          inFence = true;
          fenceChar = open[1].charAt(0);
          fenceLen = open[1].length;
          var info = open[2].trim();
          lang = info ? info.split(/[ \t]+/)[0] : '';
          buf = [];
          continue;
        }
        proseBuf.push(line);
        continue;
      }
      var close = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1].charAt(0) === fenceChar && close[1].length >= fenceLen) {
        blocks.push({ lang: lang, body: buf.join('\n') });
        inFence = false;
        buf = [];
        continue;
      }
      buf.push(line);
    }
    if (inFence) blocks.push({ lang: lang, body: buf.join('\n') });
    flushProse();
    return { prose: proseParts.join('\n'), blocks: blocks };
  }

  function firstParagraph(prose) {
    var lines = prose.split('\n');
    var i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i < lines.length && /^#[ \t]+\S/.test(lines[i])) {
      i++;
      while (i < lines.length && lines[i].trim() === '') i++;
    }
    var buf = [];
    for (; i < lines.length; i++) {
      if (lines[i].trim() === '') break;
      buf.push(lines[i].trim());
    }
    if (!buf.length) return '';
    var first = buf[0];
    if (/^#{1,6}[ \t]/.test(first)) return '';
    if (/^([-*+]|\d+\.)[ \t]/.test(first)) return '';
    if (/^(```|~~~)/.test(first)) return '';
    if (/^---+$/.test(first)) return '';
    return collapse(buf.join(' '));
  }

  function headingTexts(prose) {
    var out = [];
    var lines = prose.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^#{2,3}[ \t]+(.+?)\s*$/);
      if (!m) continue;
      out.push(m[1].replace(/\s+#+\s*$/, '').trim());
    }
    return out;
  }

  function descriptionScore(len) {
    if (len >= 80) return 40;
    if (len >= 40) return 25;
    if (len >= 12) return 10;
    return 0;
  }

  function sectionScore(count) {
    if (count >= 3) return 30;
    if (count === 2) return 20;
    if (count === 1) return 10;
    return 0;
  }

  function exampleSignal(headings, prose) {
    for (var i = 0; i < headings.length; i++) {
      if (/\bexamples?\b/i.test(headings[i])) return 15;
    }
    if (/\bfor example\b|\be\.g\.(?!\w)|\bexample:/i.test(prose)) return 10;
    return 0;
  }

  function stepScore(prose) {
    var n = 0;
    var lines = prose.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (/^[ \t]*\d{1,2}\.[ \t]+\S/.test(lines[i])) n++;
    }
    if (n >= 3) return 15;
    if (n >= 1) return 5;
    return 0;
  }

  function isPasteable(block) {
    var body = block.body.trim();
    if (body.length < 8) return false;
    if (body.replace(/[.\s]/g, '') === '') return false;
    if (PLACEHOLDER_RE.test(body)) return false;
    return true;
  }

  function blockPoints(count) {
    if (count >= 2) return 50;
    if (count === 1) return 30;
    return 0;
  }

  function pastePoints(blocks) {
    if (!blocks.length) return 0;
    var good = [];
    for (var i = 0; i < blocks.length; i++) {
      if (isPasteable(blocks[i])) good.push(blocks[i]);
    }
    if (!good.length) return 0;
    if (good.length !== blocks.length) return 25;
    for (var j = 0; j < good.length; j++) {
      if (good[j].lang) return 50;
    }
    return 40;
  }

  function warningScore(text) {
    var secretRe = /\b(secrets?|credentials?|api[_ -]?keys?|passwords?|private keys?|access tokens?|\.env)\b/gi;
    var cautionRe = /\b(never|do not|don't|don’t|dont|avoid|must not|should not|warning)\b/gi;
    var secrets = [];
    var cautions = [];
    var m;
    while ((m = secretRe.exec(text))) secrets.push(m.index);
    while ((m = cautionRe.exec(text))) cautions.push(m.index);
    if (!secrets.length) return 0;
    if (!cautions.length) return 10;
    for (var i = 0; i < secrets.length; i++) {
      for (var j = 0; j < cautions.length; j++) {
        if (Math.abs(secrets[i] - cautions[j]) <= 400) return 50;
      }
    }
    return 25;
  }

  function hasHardcodedKey(text) {
    for (var i = 0; i < KEY_SOURCES.length; i++) {
      var found = text.match(new RegExp(KEY_SOURCES[i], 'gi'));
      if (!found) continue;
      for (var j = 0; j < found.length; j++) {
        if (!KEY_OK.test(found[j])) return true;
      }
    }
    return false;
  }

  function clarityFix(description, sections, ex, steps) {
    return bestFix([
      {
        missing: 40 - description,
        fix: description === 0
          ? 'Add a description of what this skill does and when to use it.'
          : 'Say what the skill does and when to use it, in a sentence or two.'
      },
      {
        missing: 30 - sections,
        fix: sections === 0
          ? 'Add headings so the steps are easy to scan.'
          : 'Add another heading so steps and examples are separate.'
      },
      {
        missing: 15 - ex,
        fix: ex === 0
          ? 'Add an Examples heading, or write a for-example with a real case.'
          : 'Give the example its own heading.'
      },
      {
        missing: 15 - steps,
        fix: 'Add at least three numbered steps.'
      }
    ]);
  }

  function examplesFix(blockPts, pastePts) {
    return bestFix([
      {
        missing: 50 - blockPts,
        fix: blockPts === 0
          ? 'Add a fenced code block someone can copy and run.'
          : 'Add a second fenced example.'
      },
      {
        missing: 50 - pastePts,
        fix: pastePts === 0
          ? 'Replace the placeholder with a full command or sample.'
          : pastePts === 25
            ? 'Make every code block complete. Drop placeholders like YOUR_KEY.'
            : 'Tag the fence with a language, such as bash or python.'
      }
    ]);
  }

  function safetyFix(warned, keys) {
    var warnFix = 'Add a line that says never to include secrets, credentials, or API keys.';
    if (warned === 10) {
      warnFix = 'Add a never or do-not next to the mention of secrets.';
    } else if (warned === 25) {
      warnFix = 'Move the secrets warning next to the words secret, credential, or API key.';
    }
    return bestFix([
      {
        missing: 50 - keys,
        fix: 'Remove the hardcoded key. Point the reader at an environment variable.'
      },
      { missing: 50 - warned, fix: warnFix }
    ]);
  }

  function scoreSkill(input) {
    var text = normalize(input);
    if (!text) return blankResult();

    var fm = splitFrontmatter(text);
    var parts = splitFences(fm.body);
    var prose = parts.prose;
    var descLen = Math.max(
      collapse(extractDescription(fm.yaml)).length,
      collapse(firstParagraph(prose)).length
    );
    var description = descriptionScore(descLen);
    var headings = headingTexts(prose);
    var sections = sectionScore(headings.length);
    var ex = exampleSignal(headings, prose);
    var steps = stepScore(prose);
    var concrete = Math.min(30, ex + steps);
    var blocks = parts.blocks;
    var bPts = blockPoints(blocks.length);
    var pPts = pastePoints(blocks);
    var warned = warningScore(text);
    var keys = hasHardcodedKey(text) ? 0 : 50;

    var clarity = category('clarity', 'Clarity', [
      check('Description', description, 40),
      check('Sections', sections, 30),
      check('Concrete detail', concrete, 30)
    ], clarityFix(description, sections, ex, steps));

    var examples = category('examples', 'Examples', [
      check('Code blocks', bPts, 50),
      check('Copy-pasteable', pPts, 50)
    ], examplesFix(bPts, pPts));

    var safety = category('safety', 'Safety', [
      check('Secrets warning', warned, 50),
      check('No hardcoded keys', keys, 50)
    ], safetyFix(warned, keys));

    return {
      total: Math.round((clarity.score + examples.score + safety.score) / 3),
      categories: [clarity, examples, safety]
    };
  }

  return {
    scoreSkill: scoreSkill,
    SAMPLE_SKILL: SAMPLE_SKILL
  };
});
