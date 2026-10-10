(function (root) {
  "use strict";

  var CLOSING = "If a step is not on this card, stop and ask.";

  function bulletLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean)
      .map(function (line) {
        return line.replace(/^[-*•]\s*/, "");
      });
  }

  function section(title, lines) {
    if (!lines.length) return "";
    var body = lines.map(function (line) { return "- " + line; }).join("\n");
    return title + "\n" + body + "\n\n";
  }

  function buildCard(data) {
    data = data || {};
    var job = String(data.job || "").replace(/\s+/g, " ").trim();
    var ask = Array.isArray(data.ask) ? data.ask.filter(Boolean) : [];
    var text = "JOB CARD\n\n";
    text += "Job: " + (job || "(not yet)") + "\n\n";
    text += section("Done when:", bulletLines(data.done));
    text += section("May touch:", bulletLines(data.may));
    text += section("Must not touch:", bulletLines(data.mustNot));
    text += section("Ask before:", ask.map(function (item) { return String(item).trim(); }).filter(Boolean));
    text += section("Stop if:", bulletLines(data.stop));
    text += section("Leave behind:", bulletLines(data.leave));
    text += CLOSING + "\n";
    return text;
  }

  function fileName(job) {
    var slug = String(job || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return (slug || "job-card") + ".txt";
  }

  root.JobCard = {
    buildCard: buildCard,
    fileName: fileName,
    bulletLines: bulletLines
  };

  var doc = root.document;
  if (!doc || !doc.getElementById) return;

  var form = doc.getElementById("card-form");
  if (!form) return;

  var STORAGE_KEY = "job-card-v1";
  var fields = ["job", "done", "may", "mustNot", "stop", "leave"];
  var preview = doc.getElementById("card-preview");
  var status = doc.getElementById("status");
  var askBoxes = Array.prototype.slice.call(form.querySelectorAll("input[name='ask']"));

  var example = {
    job: "Add an empty state to the projects page",
    done: "An empty list shows a short message and a way to create a project\nA list that has projects still shows those projects\nYou name the page you opened and what you clicked",
    may: "The projects page and its styles",
    mustNot: "Auth, billing, and environment files\nAny folder not named above",
    stop: "The projects page is not where you expected\nA test fails for a reason outside this job",
    leave: "Files you changed\nWhat you checked\nAnything you skipped",
    ask: ["pr", "install"]
  };

  function read() {
    var data = {};
    fields.forEach(function (name) {
      data[name] = form.elements[name] ? form.elements[name].value : "";
    });
    data.ask = askBoxes.filter(function (box) { return box.checked; }).map(function (box) {
      return box.getAttribute("data-label") || box.value;
    });
    data.askIds = askBoxes.filter(function (box) { return box.checked; }).map(function (box) {
      return box.value;
    });
    return data;
  }

  function write(data) {
    fields.forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = data[name] || "";
    });
    var ids = data.askIds || data.ask || [];
    askBoxes.forEach(function (box) {
      box.checked = ids.indexOf(box.value) !== -1;
    });
  }

  function render() {
    preview.textContent = buildCard(read());
  }

  function save() {
    var data = read();
    var stored = {
      job: data.job,
      done: data.done,
      may: data.may,
      mustNot: data.mustNot,
      stop: data.stop,
      leave: data.leave,
      ask: data.askIds
    };
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (err) {
      /* Private mode can block storage. The card still works. */
    }
  }

  function load() {
    try {
      var raw = root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;
      data.askIds = data.ask;
      write(data);
    } catch (err) {
      /* Ignore a bad saved draft. */
    }
  }

  function say(message) {
    status.textContent = message;
  }

  function hasText() {
    var data = read();
    if (fields.some(function (name) { return String(data[name] || "").trim(); })) return true;
    return askBoxes.some(function (box) { return box.checked; });
  }

  function appendStop(line) {
    var stop = form.elements.stop;
    var existing = bulletLines(stop.value);
    if (existing.indexOf(line) !== -1) {
      say("Already on the card.");
      return;
    }
    stop.value = (stop.value.trim() ? stop.value.replace(/\s*$/, "") + "\n" : "") + line;
    render();
    save();
    say("Added to Stop if.");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  form.addEventListener("input", function () {
    render();
    save();
  });

  form.addEventListener("change", function () {
    render();
    save();
  });

  Array.prototype.forEach.call(doc.querySelectorAll("[data-stop]"), function (button) {
    button.addEventListener("click", function () {
      appendStop(button.getAttribute("data-stop"));
    });
  });

  doc.getElementById("example-btn").addEventListener("click", function () {
    write(example);
    render();
    save();
    say("Example filled in. Replace it with your job.");
    form.elements.job.focus();
  });

  doc.getElementById("clear-btn").addEventListener("click", function () {
    if (hasText() && !root.confirm("Clear this card?")) return;
    write({ askIds: [] });
    try {
      root.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {}
    render();
    say("Cleared.");
    form.elements.job.focus();
  });

  doc.getElementById("copy-btn").addEventListener("click", function () {
    var text = buildCard(read());
    var done = function () { say("Copied."); };
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(done).catch(function () {
        preview.focus();
        say("Copy failed. Select the brief and copy it yourself.");
      });
      return;
    }
    preview.focus();
    say("Select the brief and copy it.");
  });

  doc.getElementById("download-btn").addEventListener("click", function () {
    var data = read();
    var blob = new Blob([buildCard(data)], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = doc.createElement("a");
    link.href = url;
    link.download = fileName(data.job);
    doc.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    say("Downloaded.");
  });

  doc.getElementById("print-btn").addEventListener("click", function () {
    render();
    root.print();
  });

  load();
  render();
})(typeof window !== "undefined" ? window : globalThis);
