/* Renders the checker. Depends on check.js. No network. */
(function () {
  'use strict';

  var form = document.getElementById('form');
  var resultEl = document.getElementById('result');
  var verdictEl = document.getElementById('verdict');
  var checksEl = document.getElementById('checks');
  var fixesEl = document.getElementById('fixes');

  function field(id) {
    return document.getElementById(id).value;
  }

  function render(result) {
    verdictEl.textContent = result.verdict;
    checksEl.replaceChildren();

    result.checks.forEach(function (check) {
      var heading = document.createElement('h3');
      heading.textContent = check.label;
      var summary = document.createElement('p');
      summary.textContent = check.summary;
      checksEl.append(heading, summary);

      if (check.bots && check.bots.length) {
        var list = document.createElement('ul');
        check.bots.forEach(function (bot) {
          var item = document.createElement('li');
          item.textContent = bot.allowed
            ? bot.name + ' can fetch /'
            : bot.name + ' is blocked (' + bot.via + ')';
          list.append(item);
        });
        checksEl.append(list);
      }

      (check.notes || []).forEach(function (note) {
        var line = document.createElement('p');
        line.textContent = note;
        checksEl.append(line);
      });
    });

    fixesEl.replaceChildren();
    var fixes = result.fixes.length ? result.fixes : ['Nothing to change.'];
    fixes.forEach(function (fix) {
      var item = document.createElement('li');
      item.textContent = fix;
      fixesEl.append(item);
    });

    resultEl.hidden = false;
    verdictEl.tabIndex = -1;
    verdictEl.focus();
  }

  function run() {
    if (!window.CrawlerCheck) {
      verdictEl.textContent = 'The checker script did not load.';
      checksEl.replaceChildren();
      fixesEl.replaceChildren();
      resultEl.hidden = false;
      return;
    }
    render(window.CrawlerCheck.score({
      robots: field('robots'),
      llms: field('llms'),
      page: field('page')
    }));
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    run();
  });

  document.getElementById('example').addEventListener('click', function () {
    var sample = window.CrawlerCheck.example;
    document.getElementById('robots').value = sample.robots;
    document.getElementById('llms').value = sample.llms;
    document.getElementById('page').value = sample.page;
    run();
  });
})();
