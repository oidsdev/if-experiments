/* Page wiring. Reads the editor and writes a curl command. Does not send it. */
(function () {
  "use strict";

  var api = window.WebhookBuilder;
  var eventSelect = document.getElementById("event");
  var endpoint = document.getElementById("endpoint");
  var payload = document.getElementById("payload");
  var gutter = document.getElementById("gutter");
  var editor = document.getElementById("editor");
  var jsonStatus = document.getElementById("json-status");
  var curlOut = document.getElementById("curl");
  var copyBtn = document.getElementById("copy");
  var copyStatus = document.getElementById("copy-status");

  api.samples.forEach(function (sample) {
    var option = document.createElement("option");
    option.value = sample.id;
    option.textContent = sample.label;
    eventSelect.appendChild(option);
  });

  function sampleById(id) {
    for (var i = 0; i < api.samples.length; i += 1) {
      if (api.samples[i].id === id) return api.samples[i];
    }
    return api.samples[0];
  }

  function renderGutter(text, badLine) {
    var lines = text.split("\n");
    gutter.textContent = "";
    for (var i = 0; i < lines.length; i += 1) {
      var span = document.createElement("span");
      span.textContent = String(i + 1);
      if (badLine === i + 1) span.className = "bad";
      gutter.appendChild(span);
    }
  }

  function setStatus(node, kind, text, lineText) {
    node.className = kind || "";
    node.textContent = text || "";
    if (lineText) {
      node.appendChild(document.createElement("br"));
      var code = document.createElement("code");
      code.textContent = lineText.length > 180 ? lineText.slice(0, 180) + "..." : lineText;
      node.appendChild(code);
    }
  }

  function revealLine(line) {
    var sample = gutter.firstElementChild;
    if (!sample || !line) return;
    var lineHeight = sample.getBoundingClientRect().height;
    if (!lineHeight) return;
    var target = (line - 1) * lineHeight;
    var viewTop = payload.scrollTop;
    var viewBottom = viewTop + payload.clientHeight - lineHeight;
    if (target < viewTop || target > viewBottom) {
      payload.scrollTop = Math.max(0, target - lineHeight);
    }
  }

  function render() {
    var text = payload.value;
    var scroll = payload.scrollTop;
    var check = api.validateJson(text);
    var urlProblem = api.endpointError(endpoint.value);
    renderGutter(text, check.ok ? 0 : check.line);
    payload.scrollTop = scroll;
    if (!check.ok) revealLine(check.line);
    gutter.scrollTop = payload.scrollTop;
    payload.setAttribute("aria-invalid", check.ok ? "false" : "true");
    editor.classList.toggle("invalid", !check.ok);

    if (check.ok) {
      setStatus(jsonStatus, "ok", "Valid JSON.");
    } else {
      setStatus(jsonStatus, "bad", check.message, check.lineText);
    }

    copyStatus.textContent = "";
    if (!check.ok || urlProblem) {
      curlOut.textContent = urlProblem && check.ok ? urlProblem : "Fix the JSON to build the command.";
      if (urlProblem && !check.ok) curlOut.textContent = "Fix the JSON and the endpoint to build the command.";
      curlOut.removeAttribute("data-command");
      copyBtn.disabled = true;
      return;
    }

    var command = api.buildCurl(endpoint.value.trim(), text);
    curlOut.textContent = command;
    curlOut.setAttribute("data-command", command);
    copyBtn.disabled = false;
  }

  function loadSample(id) {
    payload.value = api.sampleText(sampleById(id));
    copyStatus.textContent = "";
    render();
  }

  eventSelect.addEventListener("change", function () {
    loadSample(eventSelect.value);
  });

  payload.addEventListener("input", render);
  endpoint.addEventListener("input", render);
  payload.addEventListener("scroll", function () {
    gutter.scrollTop = payload.scrollTop;
  });

  copyBtn.addEventListener("click", function () {
    var command = curlOut.getAttribute("data-command") || "";
    if (!command) return;
    function mark(message) {
      copyStatus.textContent = message;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(command).then(function () {
        mark("Copied.");
      }).catch(function () {
        fallbackCopy(command, mark);
      });
      return;
    }
    fallbackCopy(command, mark);
  });

  function fallbackCopy(command, mark) {
    var area = document.createElement("textarea");
    area.value = command;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(area);
    mark(ok ? "Copied." : "Select the command and copy it.");
  }

  loadSample(api.samples[0].id);
})();
