/* Paste-only AI crawler readiness check. No network. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrawlerCheck = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var REQUIRED = ['GPTBot', 'ClaudeBot', 'PerplexityBot'];
  var ANSWER = ['ChatGPT-User', 'OAI-SearchBot', 'Claude-SearchBot', 'Perplexity-User'];
  var TRAINING = [
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
    'Bytespider',
    'Amazonbot',
    'Meta-ExternalAgent',
    'cohere-ai'
  ];

  // Product tokens are matched as substrings of these UA strings, the way
  // robots.txt groups are chosen against a crawler's real user-agent.
  var UA = {
    GPTBot: 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    ClaudeBot: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    PerplexityBot: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    'ChatGPT-User': 'Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
    'OAI-SearchBot': 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
    'Claude-SearchBot': 'Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)',
    'Perplexity-User': 'Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
    'Google-Extended': 'Mozilla/5.0 (compatible; Google-Extended)',
    'Applebot-Extended': 'Mozilla/5.0 (compatible; Applebot-Extended/1.0)',
    CCBot: 'CCBot/2.0 (+https://commoncrawl.org/faq/)',
    Bytespider: 'Mozilla/5.0 (compatible; Bytespider)',
    Amazonbot: 'Mozilla/5.0 (compatible; Amazonbot/0.1)',
    'Meta-ExternalAgent': 'Meta-ExternalAgent/1.1',
    'cohere-ai': 'cohere-ai'
  };

  var example = {
    robots: [
      'User-agent: *',
      'Allow: /',
      '',
      'Sitemap: https://example.com/sitemap.xml'
    ].join('\n'),
    llms: [
      '# Example',
      '',
      '> Example is a small site that publishes a guide and a pricing page.',
      '',
      '## Pages',
      '',
      '- [Guide](https://example.com/guide): how to start',
      '- [Pricing](https://example.com/pricing): what it costs'
    ].join('\n'),
    page: [
      '<!DOCTYPE html>',
      '<html><head>',
      '<script type="application/ld+json">',
      '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is Example?","acceptedAnswer":{"@type":"Answer","text":"A small site used to show a passing check."}}]}',
      '</script>',
      '</head><body><p>Example</p></body></html>'
    ].join('\n')
  };

  function normalize(raw) {
    return String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function looksLikeHtml(text) {
    var head = text.slice(0, 800).trim();
    return /^(?:<!--[\s\S]*?)?<!doctype\s+html\b/i.test(head) ||
      /^(?:<!--[\s\S]*?)?<html[\s>]/i.test(head);
  }

  function listNames(names) {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  function stripComment(line) {
    var hash = line.indexOf('#');
    if (hash === -1) return line;
    return line.slice(0, hash);
  }

  function escapeRegExp(value) {
    return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }

  function pathMatches(pattern, path) {
    if (!pattern) return false;
    if (pattern.charAt(0) !== '/' && pattern.charAt(0) !== '*') return false;
    var end = false;
    var body = pattern;
    if (body.charAt(body.length - 1) === '$') {
      end = true;
      body = body.slice(0, -1);
    }
    var source = '^' + body.split('*').map(escapeRegExp).join('.*') + (end ? '$' : '');
    return new RegExp(source).test(path);
  }

  function parseRobots(raw) {
    var text = normalize(raw);
    var groups = [];
    var current = null;
    var sawAgent = false;
    var orphans = [];

    function startGroup() {
      current = { agents: [], rules: [] };
      groups.push(current);
    }

    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = stripComment(lines[i]).trim();
      if (!line) {
        current = null;
        continue;
      }
      var match = line.match(/^([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*(.*)$/);
      if (!match) continue;
      var key = match[1].toLowerCase();
      var value = match[2].trim();
      if (key === 'user-agent') {
        if (!value) continue;
        sawAgent = true;
        if (!current || current.rules.length) startGroup();
        current.agents.push(value);
      } else if (key === 'allow' || key === 'disallow') {
        var rule = { allow: key === 'allow', pattern: value };
        if (!current) {
          if (!sawAgent) orphans.push(rule);
        } else {
          current.rules.push(rule);
        }
      }
    }

    if (!sawAgent && orphans.length) {
      groups.push({ agents: ['*'], rules: orphans });
    }
    return groups;
  }

  function looksLikeRobots(raw) {
    return /^\s*(user-agent|allow|disallow|sitemap|crawl-delay)\s*:/im.test(normalize(raw));
  }

  function applicableGroups(groups, ua) {
    var hay = String(ua || '').toLowerCase();
    var bestLen = 0;
    var matched = [];
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      for (var j = 0; j < group.agents.length; j++) {
        var agent = group.agents[j].trim().toLowerCase();
        if (!agent || agent === '*') continue;
        if (!hay.includes(agent)) continue;
        if (agent.length > bestLen) {
          bestLen = agent.length;
          matched = [group];
        } else if (agent.length === bestLen && matched.indexOf(group) === -1) {
          matched.push(group);
        }
      }
    }
    if (!bestLen) {
      return groups.filter(function (group) {
        return group.agents.some(function (agent) { return agent.trim() === '*'; });
      });
    }
    return matched;
  }

  function agentLabel(group, ua) {
    var hay = String(ua || '').toLowerCase();
    var best = null;
    var bestLen = 0;
    for (var i = 0; i < group.agents.length; i++) {
      var agent = group.agents[i].trim();
      var lower = agent.toLowerCase();
      if (!lower || lower === '*') continue;
      if (hay.includes(lower) && lower.length > bestLen) {
        best = agent;
        bestLen = lower.length;
      }
    }
    if (best) return best;
    return group.agents[0] || '*';
  }

  function decide(groups, ua, path) {
    var applicable = applicableGroups(groups, ua);
    var best = null;
    for (var i = 0; i < applicable.length; i++) {
      var group = applicable[i];
      var label = agentLabel(group, ua);
      for (var j = 0; j < group.rules.length; j++) {
        var rule = group.rules[j];
        if (!pathMatches(rule.pattern, path)) continue;
        var len = rule.pattern.length;
        if (!best || len > best.len || (len === best.len && rule.allow && !best.allow)) {
          best = { len: len, allow: rule.allow, pattern: rule.pattern, agent: label };
        }
      }
    }
    if (!best) {
      return {
        allowed: true,
        via: applicable.length ? 'no matching rule' : 'no robots rules'
      };
    }
    var dir = best.allow ? 'Allow' : 'Disallow';
    var shown = best.pattern === '' ? '(empty)' : best.pattern;
    return {
      allowed: best.allow,
      via: 'User-agent: ' + best.agent.trim() + ' / ' + dir + ': ' + shown
    };
  }

  function uaFor(botName) {
    if (Object.prototype.hasOwnProperty.call(UA, botName)) return UA[botName];
    var keys = Object.keys(UA);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === String(botName).toLowerCase()) return UA[keys[i]];
    }
    return botName;
  }

  function access(robotsText, botName, path) {
    return decide(parseRobots(robotsText), uaFor(botName), path || '/');
  }

  function blockedFix(names, via) {
    var who = listNames(names);
    var verb = names.length > 1 ? 'are' : 'is';
    if (via.indexOf('User-agent: *') !== -1) {
      var target = names.length > 1 ? 'each crawler' : names[0];
      return who + ' ' + verb + ' blocked by ' + via + '. Add a group for ' + target + ' with Allow: /. A named group replaces the * rules for that crawler.';
    }
    return who + ' ' + verb + ' blocked by ' + via + '. Remove that Disallow, or change it so / is allowed.';
  }

  function fixesForBlocked(bots) {
    var map = new Map();
    var order = [];
    for (var i = 0; i < bots.length; i++) {
      var bot = bots[i];
      if (bot.allowed) continue;
      if (!map.has(bot.via)) {
        map.set(bot.via, []);
        order.push(bot.via);
      }
      map.get(bot.via).push(bot.name);
    }
    return order.map(function (via) { return blockedFix(map.get(via), via); });
  }

  function checkRobots(raw) {
    var text = normalize(raw).trim();
    if (!text) {
      return {
        status: 'fail',
        summary: 'robots.txt was not pasted.',
        fixes: ['Paste robots.txt from the site root.'],
        bots: [],
        notes: []
      };
    }
    if (looksLikeHtml(text)) {
      return {
        status: 'fail',
        summary: 'This looks like HTML, not robots.txt.',
        fixes: ['Paste the robots.txt file, not a web page.'],
        bots: [],
        notes: []
      };
    }
    if (!looksLikeRobots(text)) {
      return {
        status: 'fail',
        summary: 'This does not look like robots.txt.',
        fixes: ['Use robots.txt lines such as User-agent: * and Allow: / or Disallow: /.'],
        bots: [],
        notes: []
      };
    }

    var names = REQUIRED.concat(ANSWER).concat(TRAINING);
    var bots = names.map(function (name) {
      var role = REQUIRED.indexOf(name) !== -1 ? 'required' : (ANSWER.indexOf(name) !== -1 ? 'answer' : 'training');
      var result = access(text, name, '/');
      return { name: name, role: role, allowed: result.allowed, via: result.via };
    });

    var required = bots.filter(function (bot) { return bot.role === 'required'; });
    var blockedReq = required.filter(function (bot) { return !bot.allowed; });
    var allowedReq = required.filter(function (bot) { return bot.allowed; });
    var blockedAns = bots.filter(function (bot) { return bot.role === 'answer' && !bot.allowed; });
    var blockedTrain = bots.filter(function (bot) { return bot.role === 'training' && !bot.allowed; });

    var status;
    var summary;
    if (blockedReq.length === required.length) {
      status = 'fail';
      summary = listNames(blockedReq.map(function (bot) { return bot.name; })) + ' are blocked.';
    } else if (blockedReq.length) {
      status = 'fail';
      var blockedBit = listNames(blockedReq.map(function (bot) { return bot.name; })) + ' ' + (blockedReq.length > 1 ? 'are' : 'is') + ' blocked.';
      var allowedBit = listNames(allowedReq.map(function (bot) { return bot.name; })) + ' can fetch the homepage.';
      summary = blockedBit + ' ' + allowedBit;
    } else if (blockedAns.length) {
      status = 'partial';
      summary = 'GPTBot, ClaudeBot, and PerplexityBot can fetch the homepage. ' + listNames(blockedAns.map(function (bot) { return bot.name; })) + ' ' + (blockedAns.length > 1 ? 'are' : 'is') + ' blocked.';
    } else {
      status = 'pass';
      summary = 'GPTBot, ClaudeBot, and PerplexityBot can fetch the homepage.';
    }

    var reqFixes = fixesForBlocked(blockedReq);
    var ansFixes = fixesForBlocked(blockedAns);
    if (reqFixes.length && blockedReq.every(function (bot) { return access(text, bot.name, '/llms.txt').allowed; })) {
      reqFixes[reqFixes.length - 1] += ' Those crawlers can still fetch /llms.txt, but the homepage block keeps them out of the site.';
    }
    var fixes = reqFixes.concat(ansFixes);

    var notes = [];
    if (blockedTrain.length) {
      notes.push('Blocked training crawlers: ' + listNames(blockedTrain.map(function (bot) { return bot.name; })) + '. Leaving them blocked does not change this verdict.');
    }

    return {
      status: status,
      summary: summary,
      fixes: fixes,
      bots: bots.filter(function (bot) { return bot.role !== 'training'; }),
      notes: notes
    };
  }

  function checkLlms(raw) {
    var text = normalize(raw).trim();
    if (!text) {
      return {
        status: 'fail',
        summary: 'llms.txt was not pasted.',
        fixes: ['Add /llms.txt and paste it here. Open with # Site name, then a > summary, then a ## section of https links.']
      };
    }
    if (looksLikeHtml(text)) {
      return {
        status: 'fail',
        summary: 'This looks like HTML, not llms.txt.',
        fixes: ['llms.txt is a Markdown file at /llms.txt. Paste that file, not a web page.']
      };
    }

    var lines = text.split('\n');
    var h1 = [];
    var h2 = [];
    var first = '';
    var blockquoteIndex = -1;
    var firstH2Index = -1;
    var links = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) continue;
      if (!first) first = trimmed;
      if (/^#(?!#)\s*\S/.test(trimmed)) h1.push(trimmed.replace(/^#\s*/, '').trim());
      if (/^##(?!#)\s*\S/.test(trimmed)) {
        h2.push(trimmed.replace(/^##\s*/, '').trim());
        if (firstH2Index === -1) firstH2Index = i;
      }
      if (/^>\s*\S/.test(trimmed) && blockquoteIndex === -1) blockquoteIndex = i;
      if (/^\s*[-*+]\s+/.test(line)) {
        var link = line.match(/\[[^\]]+\]\(([^)\s]+)\)/);
        if (link) links.push(link[1]);
      }
    }

    if (!h1.length) {
      return {
        status: 'fail',
        summary: 'llms.txt has no # title, so it is not well-formed.',
        fixes: ['Start llms.txt with a title line: # Site name']
      };
    }

    var absolute = links.filter(function (url) { return /^https?:\/\//i.test(url); });
    var relative = links.filter(function (url) { return !/^https?:\/\//i.test(url); });
    var h1First = /^#(?!#)\s*\S/.test(first);
    var fixes = [];

    if (h1.length > 1) fixes.push('Keep a single # title. Change the other top-level titles to ## sections.');
    if (!h1First) fixes.push('Put the # title on the first line of llms.txt.');
    if (blockquoteIndex === -1) fixes.push('Add a summary under the title on a line that starts with >.');
    else if (firstH2Index !== -1 && blockquoteIndex > firstH2Index) fixes.push('Move the > summary above the first ## section.');
    if (!h2.length) fixes.push('Add a ## section for the links, for example ## Pages.');
    if (!links.length) fixes.push('Add link lines under a section: - [Page name](https://example.com/page): what it covers.');
    else if (relative.length) fixes.push('Change llms.txt links to absolute https URLs.');

    if (!fixes.length) {
      var noun = absolute.length === 1 ? 'link' : 'links';
      return {
        status: 'pass',
        summary: 'Well-formed: a title, a summary, and ' + absolute.length + ' ' + noun + '.',
        fixes: []
      };
    }

    var missing = [];
    if (!h1First || h1.length !== 1) missing.push('one title at the top');
    if (blockquoteIndex === -1 || (firstH2Index !== -1 && blockquoteIndex > firstH2Index)) missing.push('a summary above the sections');
    if (!h2.length || !absolute.length || relative.length) missing.push('a section of absolute https links');

    return {
      status: 'partial',
      summary: missing.length
        ? 'llms.txt is present, but it still needs ' + listNames(missing) + '.'
        : 'llms.txt is present, but it is not well-formed yet.',
      fixes: fixes
    };
  }

  function tryParse(value) {
    try {
      return JSON.parse(value);
    } catch (err) {
      return null;
    }
  }

  function parseLdBlock(raw) {
    var trimmed = String(raw || '').replace(/<!--/g, '').replace(/-->/g, '').trim();
    if (!trimmed) return { ok: false, value: null };
    var parsed = tryParse(trimmed);
    if (parsed) return { ok: true, value: parsed };
    if (trimmed.charAt(0) === '{') {
      parsed = tryParse('[' + trimmed + ']');
      if (parsed) return { ok: true, value: parsed };
    }
    return { ok: false, value: null };
  }

  function collectObjects(value, out) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) collectObjects(value[i], out);
      return;
    }
    out.push(value);
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) collectObjects(value[keys[k]], out);
  }

  function extractBalanced(text) {
    var found = [];
    var i = 0;
    while (i < text.length) {
      if (text.charAt(i) !== '{') {
        i++;
        continue;
      }
      var depth = 0;
      var inStr = false;
      var esc = false;
      var end = -1;
      for (var j = i; j < text.length; j++) {
        var ch = text.charAt(j);
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end === -1) break;
      var slice = text.slice(i, end + 1);
      if (slice.indexOf('@type') !== -1 || slice.indexOf('@context') !== -1) {
        var parsed = tryParse(slice);
        if (parsed) found.push(parsed);
      }
      i = end + 1;
    }
    return found;
  }

  function hasType(node, type) {
    if (!node || typeof node !== 'object') return false;
    var value = node['@type'];
    var list = Array.isArray(value) ? value : (value ? [value] : []);
    var want = type.toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase() === want) return true;
    }
    return false;
  }

  function textValue(value) {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object' && typeof value['@value'] === 'string') return value['@value'].trim();
    return '';
  }

  function checkFaq(parts) {
    var text = parts.map(function (part) { return normalize(part); }).join('\n\n');
    if (!text.trim()) {
      return {
        status: 'fail',
        summary: 'No page or JSON-LD was pasted.',
        fixes: ['Paste a page you want cited, or its JSON-LD. The check looks for an FAQPage with at least one answered question.']
      };
    }

    var objects = [];
    var sawLdScript = false;
    var sawParseFail = false;
    var scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = scriptRe.exec(text))) {
      var attrs = match[1] || '';
      if (!/type\s*=\s*["']application\/ld\+json/i.test(attrs)) continue;
      sawLdScript = true;
      var parsed = parseLdBlock(match[2]);
      if (!parsed.ok) {
        if (match[2].trim()) sawParseFail = true;
        continue;
      }
      collectObjects(parsed.value, objects);
    }

    var trimmed = text.trim();
    if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
      var whole = parseLdBlock(trimmed);
      if (whole.ok) collectObjects(whole.value, objects);
    }

    if (!objects.length) {
      var balanced = extractBalanced(text);
      for (var b = 0; b < balanced.length; b++) collectObjects(balanced[b], objects);
    }

    var byId = new Map();
    for (var n = 0; n < objects.length; n++) {
      if (typeof objects[n]['@id'] === 'string') byId.set(objects[n]['@id'], objects[n]);
    }

    function deref(node) {
      if (typeof node === 'string' && byId.has(node)) return byId.get(node);
      if (node && typeof node === 'object' && typeof node['@id'] === 'string' && !node.name && !node['@type'] && byId.has(node['@id'])) {
        return byId.get(node['@id']);
      }
      return node;
    }

    function questionComplete(node) {
      node = deref(node);
      if (!hasType(node, 'Question')) return false;
      if (!textValue(node.name)) return false;
      var answers = Array.isArray(node.acceptedAnswer) ? node.acceptedAnswer : [node.acceptedAnswer];
      for (var i = 0; i < answers.length; i++) {
        var answer = deref(answers[i]);
        if (answer && textValue(answer.text)) return true;
      }
      return false;
    }

    var faqNodes = objects.filter(function (node) { return hasType(node, 'FAQPage'); });
    var completeQuestions = 0;
    for (var f = 0; f < faqNodes.length; f++) {
      var entities = faqNodes[f].mainEntity;
      var list = Array.isArray(entities) ? entities : (entities ? [entities] : []);
      for (var q = 0; q < list.length; q++) {
        if (questionComplete(list[q])) completeQuestions++;
      }
    }

    if (completeQuestions > 0) {
      var qNoun = completeQuestions === 1 ? 'question' : 'questions';
      return {
        status: 'pass',
        summary: 'FAQPage JSON-LD with ' + completeQuestions + ' ' + qNoun + '.',
        fixes: []
      };
    }

    var microFaq = /itemtype\s*=\s*["']https?:\/\/schema\.org\/FAQPage["']/i.test(text);
    var microQuestion = /itemtype\s*=\s*["']https?:\/\/schema\.org\/Question["']/i.test(text);
    var microAnswer = /itemprop\s*=\s*["']acceptedAnswer["']/i.test(text) ||
      /itemtype\s*=\s*["']https?:\/\/schema\.org\/Answer["']/i.test(text);
    if (microFaq && microQuestion && microAnswer) {
      return {
        status: 'pass',
        summary: 'FAQPage is declared in microdata, with a question and an answer.',
        fixes: []
      };
    }

    if (faqNodes.length || microFaq) {
      return {
        status: 'partial',
        summary: 'FAQPage is declared, but no question has both a name and an answer.',
        fixes: ['Finish the FAQPage: each Question needs a name and an acceptedAnswer text.']
      };
    }

    if (objects.length) {
      var types = [];
      for (var t = 0; t < objects.length; t++) {
        var value = objects[t]['@type'];
        var list = Array.isArray(value) ? value : (value ? [value] : []);
        for (var u = 0; u < list.length; u++) {
          var typeName = String(list[u]);
          if (types.indexOf(typeName) === -1) types.push(typeName);
        }
      }
      var shown = types.slice(0, 3).join(', ');
      var summary = shown
        ? 'JSON-LD is present (' + shown + '), but there is no FAQPage.'
        : 'JSON-LD is present, but there is no FAQPage.';
      return {
        status: 'partial',
        summary: summary,
        fixes: ['Add an FAQPage JSON-LD block with at least one Question and an accepted answer.']
      };
    }

    if (sawLdScript && sawParseFail) {
      return {
        status: 'partial',
        summary: 'A JSON-LD script is present, but it did not parse.',
        fixes: ['Fix the JSON-LD script. It needs to be valid JSON, usually one object or an array of objects.']
      };
    }

    return {
      status: 'fail',
      summary: 'No FAQ JSON-LD found.',
      fixes: ['Add a script with type application/ld+json, @type FAQPage, and at least one answered question. Paste that page, or just the script.']
    };
  }

  function verdictOf(checks) {
    var fails = checks.filter(function (check) { return check.status === 'fail'; }).length;
    var allPass = checks.every(function (check) { return check.status === 'pass'; });
    if (allPass) return 'Ready';
    if (fails >= 2) return 'Not ready';
    return 'Needs work';
  }

  function score(input) {
    input = input || {};
    var llms = checkLlms(input.llms);
    var robots = checkRobots(input.robots);
    var faq = checkFaq([input.robots, input.llms, input.page]);
    var checks = [
      { id: 'llms', label: 'llms.txt', status: llms.status, summary: llms.summary },
      { id: 'robots', label: 'AI crawlers', status: robots.status, summary: robots.summary, bots: robots.bots, notes: robots.notes },
      { id: 'faq', label: 'FAQ schema', status: faq.status, summary: faq.summary }
    ];
    var fixes = [];
    [llms, robots, faq].forEach(function (check) {
      (check.fixes || []).forEach(function (fix) {
        if (fixes.indexOf(fix) === -1) fixes.push(fix);
      });
    });
    return {
      verdict: verdictOf(checks),
      checks: checks,
      fixes: fixes
    };
  }

  return {
    score: score,
    access: access,
    example: example
  };
});
