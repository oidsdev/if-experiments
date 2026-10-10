const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const check = require('./check.js');

const dir = __dirname;

const goodLlms = [
  '# Example',
  '',
  '> A short summary of the site.',
  '',
  '## Pages',
  '',
  '- [Guide](https://example.com/guide): how to start'
].join('\n');

const goodFaq = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [{
    '@type': 'Question',
    name: 'What is this?',
    acceptedAnswer: { '@type': 'Answer', text: 'A test.' }
  }]
});

function score(overrides) {
  return check.score(Object.assign({
    robots: 'User-agent: *\nAllow: /\n',
    llms: goodLlms,
    page: goodFaq
  }, overrides));
}

function status(result, id) {
  return result.checks.find((item) => item.id === id).status;
}

test('example paste is Ready', () => {
  const result = check.score(check.example);
  assert.equal(result.verdict, 'Ready');
  assert.deepEqual(result.fixes, []);
  assert.equal(status(result, 'llms'), 'pass');
  assert.equal(status(result, 'robots'), 'pass');
  assert.equal(status(result, 'faq'), 'pass');
});

test('empty paste is Not ready', () => {
  const result = check.score({});
  assert.equal(result.verdict, 'Not ready');
  assert.equal(status(result, 'llms'), 'fail');
  assert.equal(status(result, 'robots'), 'fail');
  assert.equal(status(result, 'faq'), 'fail');
  assert.match(result.fixes.join('\n'), /llms\.txt/);
  assert.match(result.fixes.join('\n'), /robots\.txt/);
  assert.match(result.fixes.join('\n'), /FAQPage/);
});

test('one failed check is Needs work', () => {
  const result = score({ llms: '# Example only' });
  assert.equal(status(result, 'llms'), 'partial');
  assert.equal(result.verdict, 'Needs work');
  assert.match(result.fixes.join('\n'), /summary/);
});

test('two failed checks are Not ready', () => {
  const result = score({ llms: '', page: '' });
  assert.equal(result.verdict, 'Not ready');
});

test('llms.txt structure', () => {
  assert.equal(status(score({ llms: '<!DOCTYPE html><html></html>' }), 'llms'), 'fail');
  assert.equal(status(score({ llms: 'Just a paragraph.' }), 'llms'), 'fail');

  const relative = check.score({
    robots: 'User-agent: *\nAllow: /\n',
    llms: '# Example\n\n> Summary.\n\n## Pages\n\n- [Guide](/guide): start\n',
    page: goodFaq
  });
  assert.equal(status(relative, 'llms'), 'partial');
  assert.match(relative.fixes.join('\n'), /absolute https/);

  const lateSummary = score({
    llms: '# Example\n\n## Pages\n\n- [Guide](https://example.com/guide): start\n\n> Summary.\n'
  });
  assert.equal(status(lateSummary, 'llms'), 'partial');
  assert.match(lateSummary.fixes.join('\n'), /Move the > summary/);
});

test('robots.txt allows and blocks named crawlers', () => {
  assert.equal(check.access('User-agent: *\nAllow: /\n', 'GPTBot', '/').allowed, true);
  assert.equal(check.access('User-agent: *\nDisallow: /\n', 'ClaudeBot', '/').allowed, false);
  assert.equal(check.access('User-agent: *\nDisallow: /private\n', 'PerplexityBot', '/').allowed, true);
  assert.equal(check.access('User-agent: *\nDisallow: /*.pdf$\n', 'GPTBot', '/a.pdf').allowed, false);
  assert.equal(check.access('User-agent: *\nDisallow: /*.pdf$\n', 'GPTBot', '/').allowed, true);

  const tie = check.access('User-agent: *\nDisallow: /\nAllow: /\n', 'GPTBot', '/');
  assert.equal(tie.allowed, true);

  const exact = check.access('User-agent: *\nDisallow: /\nAllow: /$\n', 'GPTBot', '/');
  assert.equal(exact.allowed, true);
  assert.equal(check.access('User-agent: *\nDisallow: /\nAllow: /$\n', 'GPTBot', '/about').allowed, false);

  const named = check.access([
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    ''
  ].join('\n'), 'GPTBot', '/');
  assert.equal(named.allowed, true);
  assert.equal(check.access([
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /'
  ].join('\n'), 'ClaudeBot', '/').allowed, false);

  assert.equal(check.access('User-agent: gptbot\nDisallow: /\n', 'GPTBot', '/').allowed, false);
  assert.equal(check.access('# comment\nUser-agent: *\nDisallow: /admin # private\n', 'GPTBot', '/').allowed, true);

  const bom = check.access('\uFEFFUser-agent: *\r\nDisallow: /\r\n', 'PerplexityBot', '/');
  assert.equal(bom.allowed, false);

  assert.equal(check.access('Sitemap: https://example.com/sitemap.xml\n', 'GPTBot', '/').allowed, true);
  assert.equal(check.access('Disallow: /\n', 'ClaudeBot', '/').allowed, false);

  const orphanIgnored = check.access('Disallow: /\n\nUser-agent: *\nAllow: /\n', 'GPTBot', '/');
  assert.equal(orphanIgnored.allowed, true);

  assert.equal(check.access('User-agent: GPTBot\nDisallow: /\n', 'ChatGPT-User', '/').allowed, true);
  assert.equal(check.access('User-agent: ChatGPT-User\nDisallow: /\n', 'GPTBot', '/').allowed, true);
});

test('specific GPTBot block is Needs work when the rest passes', () => {
  const result = score({
    robots: 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n'
  });
  assert.equal(result.verdict, 'Needs work');
  assert.equal(status(result, 'robots'), 'fail');
  const robots = result.checks.find((item) => item.id === 'robots');
  const gpt = robots.bots.find((bot) => bot.name === 'GPTBot');
  const claude = robots.bots.find((bot) => bot.name === 'ClaudeBot');
  assert.equal(gpt.allowed, false);
  assert.equal(claude.allowed, true);
  assert.match(result.fixes.join('\n'), /GPTBot/);
  assert.doesNotMatch(result.fixes.join('\n'), /Google-Extended/);
});

test('wildcard block names the three crawlers and ignores training opt-out', () => {
  const result = score({
    robots: 'User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n'
  });
  assert.equal(status(result, 'robots'), 'partial');
  assert.equal(result.verdict, 'Needs work');
  assert.match(result.fixes.join('\n'), /ChatGPT-User/);
  assert.match(result.checks.find((item) => item.id === 'robots').notes.join('\n'), /Google-Extended/);
  assert.doesNotMatch(result.fixes.join('\n'), /Google-Extended/);
});

test('homepage block with llms.txt still open is called out', () => {
  const result = score({
    robots: 'User-agent: *\nDisallow: /\nAllow: /llms.txt\n'
  });
  assert.match(result.fixes.join('\n'), /\/llms\.txt/);
  assert.equal(check.access('User-agent: *\nDisallow: /\nAllow: /llms.txt\n', 'GPTBot', '/llms.txt').allowed, true);
});

test('FAQ JSON-LD shapes', () => {
  const graph = score({
    page: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Example' },
        {
          '@type': 'FAQPage',
          mainEntity: [{ '@id': '#q1' }]
        },
        {
          '@id': '#q1',
          '@type': 'Question',
          name: 'Where?',
          acceptedAnswer: { '@type': 'Answer', text: 'Here.' }
        }
      ]
    })
  });
  assert.equal(status(graph, 'faq'), 'pass');

  const org = score({
    page: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Example' })
  });
  assert.equal(status(org, 'faq'), 'partial');
  assert.match(org.fixes.join('\n'), /FAQPage/);

  const shell = score({
    page: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] })
  });
  assert.equal(status(shell, 'faq'), 'partial');

  const broken = score({
    page: '<script type="application/ld+json">{ not json }</script>'
  });
  assert.equal(status(broken, 'faq'), 'partial');

  const commaPair = score({
    page: '<script type="application/ld+json">{"@type":"Organization","name":"A"},{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q","acceptedAnswer":{"@type":"Answer","text":"A"}}]}</script>'
  });
  assert.equal(status(commaPair, 'faq'), 'pass');

  const micro = score({
    page: [
      '<div itemscope itemtype="https://schema.org/FAQPage">',
      '<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">',
      '<p itemprop="name">What?</p>',
      '<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">',
      '<p itemprop="text">This.</p>',
      '</div></div></div>'
    ].join('')
  });
  assert.equal(status(micro, 'faq'), 'pass');
});

test('html and robots garbage do not count as files', () => {
  const result = score({
    robots: '<!DOCTYPE html><html><body>User-agent: *</body></html>',
    llms: '<!DOCTYPE html><html></html>'
  });
  assert.equal(status(result, 'robots'), 'fail');
  assert.equal(status(result, 'llms'), 'fail');
  assert.match(result.fixes.join('\n'), /not a web page/);
});

test('page is static and does not fetch', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(dir, 'ui.js'), 'utf8');
  const source = fs.readFileSync(path.join(dir, 'check.js'), 'utf8');
  const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(srcs, ['check.js', 'ui.js']);
  assert.doesNotMatch(html + ui + source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|gtag\s*\(|google-analytics|googletagmanager|api[_-]?key/i);
  assert.match(html, /AI crawler readiness/);
  assert.match(html, /id="robots"/);
  assert.match(html, /id="llms"/);
  assert.match(html, /id="page"/);
});
