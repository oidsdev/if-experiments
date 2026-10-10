var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var scorer = require('./score.js');

var scoreSkill = scorer.scoreSkill;

function cat(result, id) {
  for (var i = 0; i < result.categories.length; i++) {
    if (result.categories[i].id === id) return result.categories[i];
  }
  throw new Error('missing category ' + id);
}

function pts(result, id, label) {
  var checks = cat(result, id).checks;
  for (var i = 0; i < checks.length; i++) {
    if (checks[i].label === label) return checks[i].score;
  }
  throw new Error('missing check ' + label);
}

function longDescription(extra) {
  return [
    '---',
    'description: This skill renames a batch of image files in one folder. Use it when the user asks to rename those images and wants each new name written down.',
    '---',
    '',
    extra || ''
  ].join('\n');
}

test('blank input scores zero and asks for a file', function () {
  var inputs = ['', '   \n\t', null, undefined];
  for (var i = 0; i < inputs.length; i++) {
    var result = scoreSkill(inputs[i]);
    assert.equal(result.total, 0);
    assert.equal(result.categories.length, 3);
    for (var c = 0; c < result.categories.length; c++) {
      assert.equal(result.categories[c].score, 0);
      assert.equal(result.categories[c].fix, 'Paste a SKILL.md or CLAUDE.md.');
    }
  }
});

test('the same input always returns the same score', function () {
  var sample = scorer.SAMPLE_SKILL;
  assert.equal(JSON.stringify(scoreSkill(sample)), JSON.stringify(scoreSkill(sample)));
  assert.equal(
    JSON.stringify(scoreSkill(sample)),
    JSON.stringify(scoreSkill(sample.replace(/\n/g, '\r\n')))
  );
  assert.equal(
    JSON.stringify(scoreSkill(sample)),
    JSON.stringify(scoreSkill('\n\n' + sample + '\n'))
  );
});

test('a complete skill scores 100 with no fixes', function () {
  var result = scoreSkill(scorer.SAMPLE_SKILL);
  assert.equal(result.total, 100);
  assert.equal(cat(result, 'clarity').score, 100);
  assert.equal(cat(result, 'examples').score, 100);
  assert.equal(cat(result, 'safety').score, 100);
  for (var i = 0; i < result.categories.length; i++) {
    assert.equal(result.categories[i].fix, '');
  }
});

test('description length uses frontmatter or the opening paragraph', function () {
  function front(n) {
    return '---\ndescription: ' + 'a'.repeat(n) + '\n---\n\n# Title\n';
  }
  assert.equal(pts(scoreSkill(front(80)), 'clarity', 'Description'), 40);
  assert.equal(pts(scoreSkill(front(40)), 'clarity', 'Description'), 25);
  assert.equal(pts(scoreSkill(front(12)), 'clarity', 'Description'), 10);
  assert.equal(pts(scoreSkill(front(11)), 'clarity', 'Description'), 0);

  var folded = [
    '---',
    'description: >',
    '  Pulls headings and quotes out of a PDF and writes a one-page brief.',
    '  Use this when the user hands you a PDF.',
    '---',
    '',
    '# Title',
    ''
  ].join('\n');
  assert.equal(pts(scoreSkill(folded), 'clarity', 'Description'), 40);

  var prose = [
    '# Repo notes',
    '',
    'When you change this repo, keep each page as one HTML file with no build step. Use it when adding a page under experiments.',
    ''
  ].join('\n');
  assert.equal(pts(scoreSkill(prose), 'clarity', 'Description'), 40);
  assert.match(cat(scoreSkill(prose), 'clarity').fix, /heading/i);
});

test('headings and steps inside code fences do not count as prose', function () {
  var text = longDescription([
    '## Real',
    '',
    '```markdown',
    '## Fake',
    '## Also fake',
    '## Third fake',
    '1. not a step',
    '2. still not',
    '3. nope',
    '```',
    '',
    '1. The only real step.'
  ].join('\n'));
  var result = scoreSkill(text);
  assert.equal(pts(result, 'clarity', 'Sections'), 10);
  assert.equal(pts(result, 'clarity', 'Concrete detail'), 5);
  assert.equal(pts(result, 'examples', 'Code blocks'), 30);
  assert.equal(pts(result, 'examples', 'Copy-pasteable'), 50);
  assert.equal(cat(result, 'examples').fix, 'Add a second fenced example.');
});

test('example phrasing and numbered steps add concrete points', function () {
  var phrase = longDescription('Use e.g. the folder of scans on the desktop.');
  assert.equal(pts(scoreSkill(phrase), 'clarity', 'Concrete detail'), 10);

  var heading = longDescription('## Examples\n\n1. One step.\n2. Two steps.\n3. Three steps.\n');
  assert.equal(pts(scoreSkill(heading), 'clarity', 'Concrete detail'), 30);
  assert.equal(pts(scoreSkill(heading), 'clarity', 'Sections'), 10);
});

test('placeholder fences are not copy-pasteable and are not treated as keys', function () {
  var text = [
    '# Tool',
    '',
    'Call the service with the command below when you need the current status of the job.',
    '',
    '## Steps',
    '',
    '1. Run it.',
    '2. Read the output.',
    '3. Stop.',
    '',
    '```bash',
    'curl -H "Authorization: Bearer YOUR_API_KEY" https://api.example.com/me',
    '```',
    ''
  ].join('\n');
  var result = scoreSkill(text);
  assert.equal(pts(result, 'examples', 'Copy-pasteable'), 0);
  assert.equal(cat(result, 'examples').fix, 'Replace the placeholder with a full command or sample.');
  assert.equal(pts(result, 'safety', 'No hardcoded keys'), 50);
  assert.equal(result.categories.some(function (c) {
    return c.fix.indexOf('YOUR_API_KEY') !== -1;
  }), false);
});

test('untagged complete fences lose only the language points', function () {
  var text = longDescription([
    '```',
    'pdftotext -layout paper.pdf -',
    '```',
    '',
    '```',
    'pdftotext -layout notes.pdf brief.txt',
    '```',
    ''
  ].join('\n'));
  var result = scoreSkill(text);
  assert.equal(pts(result, 'examples', 'Code blocks'), 50);
  assert.equal(pts(result, 'examples', 'Copy-pasteable'), 40);
  assert.equal(cat(result, 'examples').fix, 'Tag the fence with a language, such as bash or python.');
});

test('a nearby secrets warning scores full marks and a distant one does not', function () {
  var close = longDescription('Never put secrets or API keys in the log.');
  assert.equal(pts(scoreSkill(close), 'safety', 'Secrets warning'), 50);
  assert.equal(cat(scoreSkill(close), 'safety').fix, '');

  var named = longDescription('The password for the archive stays with the user.');
  assert.equal(pts(scoreSkill(named), 'safety', 'Secrets warning'), 10);
  assert.equal(cat(scoreSkill(named), 'safety').fix, 'Add a never or do-not next to the mention of secrets.');

  var far = longDescription('Never do this lightly.\n\n' + 'word '.repeat(120) + '\n\nThe password stays in the notebook.\n');
  assert.equal(pts(scoreSkill(far), 'safety', 'Secrets warning'), 25);
  assert.match(cat(scoreSkill(far), 'safety').fix, /Move the secrets warning/);
});

test('hardcoded keys fail safety and are not echoed back', function () {
  var token = 'sk-abcdefghijklmnopqrstuvwxyz12';
  var text = longDescription([
    'Never paste API keys into the log.',
    '',
    '```bash',
    'curl -H "Authorization: Bearer ' + token + '" https://api.example.com/me',
    '```',
    ''
  ].join('\n'));
  var result = scoreSkill(text);
  assert.equal(pts(result, 'safety', 'No hardcoded keys'), 0);
  assert.equal(cat(result, 'safety').fix, 'Remove the hardcoded key. Point the reader at an environment variable.');
  assert.equal(JSON.stringify(result).indexOf(token), -1);

  var fake = longDescription('The docs show sk-example-key-not-real-ok as a stand-in.');
  assert.equal(pts(scoreSkill(fake), 'safety', 'No hardcoded keys'), 50);

  var assigned = longDescription('api_key: "abcdEFGH1234567890zzzz"');
  assert.equal(pts(scoreSkill(assigned), 'safety', 'No hardcoded keys'), 0);

  var env = longDescription('api_key: "$API_KEY"');
  assert.equal(pts(scoreSkill(env), 'safety', 'No hardcoded keys'), 50);

  var pem = longDescription('-----BEGIN PRIVATE KEY-----');
  assert.equal(pts(scoreSkill(pem), 'safety', 'No hardcoded keys'), 0);
});

test('the total is the rounded average of the three categories', function () {
  var thirty = scoreSkill(longDescription('Rename the files and leave a note.'));
  assert.equal(cat(thirty, 'clarity').score, 40);
  assert.equal(cat(thirty, 'examples').score, 0);
  assert.equal(cat(thirty, 'safety').score, 50);
  assert.equal(thirty.total, 30);

  var thirtyThree = scoreSkill(longDescription('The password for the archive stays with the user.'));
  assert.equal(cat(thirtyThree, 'clarity').score, 40);
  assert.equal(cat(thirtyThree, 'safety').score, 60);
  assert.equal(thirtyThree.total, 33);

  var thirtySeven = scoreSkill(longDescription('## Notes\n\nThe password for the archive stays with the user.\n'));
  assert.equal(cat(thirtySeven, 'clarity').score, 50);
  assert.equal(cat(thirtySeven, 'safety').score, 60);
  assert.equal(thirtySeven.total, 37);
});

test('every category under 100 has one single-line fix', function () {
  var inputs = [
    scorer.SAMPLE_SKILL,
    '# Hi\n',
    longDescription('## Only\n'),
    'Never share secrets.\n',
    '```\nls\n```\n'
  ];
  for (var i = 0; i < inputs.length; i++) {
    var result = scoreSkill(inputs[i]);
    var sum = 0;
    assert.equal(result.categories.map(function (c) { return c.id; }).join(','), 'clarity,examples,safety');
    for (var c = 0; c < result.categories.length; c++) {
      var category = result.categories[c];
      var checkSum = 0;
      for (var k = 0; k < category.checks.length; k++) {
        var item = category.checks[k];
        assert.ok(item.score >= 0 && item.score <= item.max);
        checkSum += item.score;
      }
      assert.equal(category.score, checkSum);
      assert.ok(category.score >= 0 && category.score <= 100);
      assert.equal(category.fix.indexOf('\n'), -1);
      assert.ok(category.fix.length < 160);
      if (category.score === 100) assert.equal(category.fix, '');
      else assert.ok(category.fix.length > 0);
      sum += category.score;
    }
    assert.equal(result.total, Math.round(sum / 3));
  }
});

test('the scorer stays local', function () {
  var src = fs.readFileSync(path.join(__dirname, 'score.js'), 'utf8');
  assert.doesNotMatch(src, /fetch\s*\(|XMLHttpRequest|localStorage|document\.|navigator\./);
});

test('the page is static and does not phone home', function () {
  var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /Skill Scorer/);
  assert.match(html, /src="score\.js"/);
  assert.match(html, /Nothing is uploaded/);
  assert.match(html, /Clarity/);
  assert.match(html, /Examples/);
  assert.match(html, /Safety/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href="https?:/i);
  assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|localStorage|gtag|google-analytics|cloudflareinsights/i);
});
