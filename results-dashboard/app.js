(function () {
  "use strict";

  var INK = "#1a1a1a";
  var MUTED = "#666666";
  var GRID = "#e6e6e6";
  var ZERO = "#bdbdbd";
  var MathSIN45 = Math.sin(Math.PI / 4);

  var els = {
    title: document.getElementById("title"),
    subtitle: document.getElementById("subtitle"),
    updated: document.getElementById("updated"),
    compare: document.getElementById("compare"),
    source: document.getElementById("source"),
    status: document.getElementById("status"),
    metrics: document.getElementById("metrics"),
    charts: document.getElementById("charts"),
    file: document.getElementById("file"),
  };

  var observers = [];
  var hits = new WeakMap();

  function showStatus(content, kind) {
    els.status.className = "status" + (kind ? " " + kind : "");
    els.status.replaceChildren();
    els.status.setAttribute("role", kind === "error" ? "alert" : "status");
    if (!content) {
      els.status.hidden = true;
      return;
    }
    els.status.hidden = false;
    if (typeof content === "string") els.status.textContent = content;
    else els.status.append(content);
  }

  function setLine(el, text) {
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function resetHeader() {
    els.title.textContent = "Results";
    document.title = "Results";
    setLine(els.subtitle, "");
    setLine(els.updated, "");
    setLine(els.compare, "");
    setLine(els.source, "");
  }

  function clearBoard() {
    while (observers.length) observers.pop().disconnect();
    els.metrics.replaceChildren();
    els.charts.replaceChildren();
  }

  function formatNumber(value, decimals) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  function formatMeasure(value, unit, decimals) {
    var text = formatNumber(value, decimals);
    if (!unit) return text;
    if (unit === "%") return text + "%";
    return text + "\u00a0" + unit;
  }

  function formatDelta(value, unit, decimals) {
    var body = formatMeasure(Math.abs(value), unit, decimals);
    if (value > 0) return "+" + body;
    if (value < 0) return "-" + body;
    return body;
  }

  function formatTick(value, unit) {
    var text = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value);
    return unit === "%" ? text + "%" : text;
  }

  function autoDecimals(value) {
    if (Number.isInteger(value)) return 0;
    var text = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    var dot = text.indexOf(".");
    return dot < 0 ? 0 : text.length - dot - 1;
  }

  function formatUpdated(value) {
    var day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    var date;
    var options = { day: "numeric", month: "short", year: "numeric" };
    if (day) {
      date = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
      options.timeZone = "UTC";
    } else {
      date = new Date(value);
      if (value.indexOf("T") !== -1) {
        options.hour = "2-digit";
        options.minute = "2-digit";
      }
    }
    if (Number.isNaN(date.getTime())) return "Updated " + value;
    return "Updated " + new Intl.DateTimeFormat("en-GB", options).format(date);
  }

  function optionalString(data, key, out, errors) {
    if (!Object.prototype.hasOwnProperty.call(data, key) || data[key] == null || data[key] === "") return;
    if (typeof data[key] !== "string") errors.push(key + " must be a string.");
    else out[key] = data[key].trim();
  }

  function readUnit(obj, path, out, errors) {
    if (!Object.prototype.hasOwnProperty.call(obj, "unit") || obj.unit == null || obj.unit === "") return;
    if (typeof obj.unit !== "string") {
      errors.push(path + ".unit must be a string.");
      return;
    }
    var unit = obj.unit.trim();
    if (unit.length > 16) {
      errors.push(path + ".unit must be 16 characters or fewer.");
      return;
    }
    out.unit = unit;
  }

  function readDecimals(obj, path, out, errors) {
    if (!Object.prototype.hasOwnProperty.call(obj, "decimals") || obj.decimals == null) return;
    if (typeof obj.decimals !== "number" || !Number.isInteger(obj.decimals) || obj.decimals < 0 || obj.decimals > 6) {
      errors.push(path + ".decimals must be an integer from 0 to 6.");
      return;
    }
    out.decimals = obj.decimals;
  }

  function validateMetric(metric, index, errors) {
    var path = "metrics[" + index + "]";
    if (metric === null || typeof metric !== "object" || Array.isArray(metric)) {
      errors.push(path + " must be an object.");
      return null;
    }
    var out = {};
    if (typeof metric.label !== "string" || metric.label.trim() === "") {
      errors.push(path + ".label must be a non-empty string.");
    } else {
      out.label = metric.label.trim();
    }
    if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
      errors.push(path + ".value must be a finite number.");
    } else {
      out.value = metric.value;
    }
    readUnit(metric, path, out, errors);
    readDecimals(metric, path, out, errors);
    if (Object.prototype.hasOwnProperty.call(metric, "delta") && metric.delta != null) {
      if (typeof metric.delta !== "number" || !Number.isFinite(metric.delta)) {
        errors.push(path + ".delta must be a finite number.");
      } else {
        out.delta = metric.delta;
      }
    }
    if (Object.prototype.hasOwnProperty.call(metric, "deltaLabel") && metric.deltaLabel != null && metric.deltaLabel !== "") {
      if (typeof metric.deltaLabel !== "string") errors.push(path + ".deltaLabel must be a string.");
      else out.deltaLabel = metric.deltaLabel.trim();
    }
    if (out.decimals == null && typeof out.value === "number") {
      var fromDelta = typeof out.delta === "number" ? autoDecimals(out.delta) : 0;
      out.decimals = Math.min(2, Math.max(autoDecimals(out.value), fromDelta));
    }
    return out;
  }

  function validateChart(chart, index, errors) {
    var path = "charts[" + index + "]";
    if (chart === null || typeof chart !== "object" || Array.isArray(chart)) {
      errors.push(path + " must be an object.");
      return null;
    }
    var out = { points: [] };
    if (typeof chart.title !== "string" || chart.title.trim() === "") {
      errors.push(path + ".title must be a non-empty string.");
    } else {
      out.title = chart.title.trim();
    }
    if (chart.type !== "bar" && chart.type !== "line") {
      errors.push(path + '.type must be "bar" or "line".');
    } else {
      out.type = chart.type;
    }
    readUnit(chart, path, out, errors);
    readDecimals(chart, path, out, errors);
    if (!Array.isArray(chart.points) || chart.points.length === 0) {
      errors.push(path + ".points must be a non-empty array.");
    } else {
      chart.points.forEach(function (point, j) {
        var pointPath = path + ".points[" + j + "]";
        if (point === null || typeof point !== "object" || Array.isArray(point)) {
          errors.push(pointPath + " must be an object.");
          return;
        }
        var item = {};
        if (typeof point.label !== "string" || point.label.trim() === "") {
          errors.push(pointPath + ".label must be a non-empty string.");
        } else {
          item.label = point.label.trim();
        }
        if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
          errors.push(pointPath + ".value must be a finite number.");
        } else {
          item.value = point.value;
        }
        if (item.label != null && typeof item.value === "number") out.points.push(item);
      });
    }
    if (out.decimals == null && out.points.length) {
      var digits = 0;
      out.points.forEach(function (point) {
        digits = Math.max(digits, autoDecimals(point.value));
      });
      out.decimals = Math.min(2, digits);
    }
    return out;
  }

  function validate(data) {
    var errors = [];
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, errors: ["The file must contain a JSON object."] };
    }
    var value = {
      title: "Results",
      subtitle: "",
      updated: "",
      compare: "",
      metrics: [],
      charts: [],
    };
    if (Object.prototype.hasOwnProperty.call(data, "title") && data.title != null) {
      if (typeof data.title !== "string" || data.title.trim() === "") errors.push("title must be a non-empty string.");
      else value.title = data.title.trim();
    }
    optionalString(data, "subtitle", value, errors);
    optionalString(data, "updated", value, errors);
    optionalString(data, "compare", value, errors);
    if (Object.prototype.hasOwnProperty.call(data, "metrics") && data.metrics != null) {
      if (!Array.isArray(data.metrics)) errors.push("metrics must be an array.");
      else data.metrics.forEach(function (metric, i) {
        var item = validateMetric(metric, i, errors);
        if (item) value.metrics.push(item);
      });
    }
    if (Object.prototype.hasOwnProperty.call(data, "charts") && data.charts != null) {
      if (!Array.isArray(data.charts)) errors.push("charts must be an array.");
      else data.charts.forEach(function (chart, i) {
        var item = validateChart(chart, i, errors);
        if (item) value.charts.push(item);
      });
    }
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, value: value };
  }

  function showProblems(errors, name) {
    var box = document.createElement("div");
    var lead = document.createElement("p");
    lead.textContent = name + " has " + errors.length + (errors.length === 1 ? " problem:" : " problems:");
    var list = document.createElement("ul");
    errors.slice(0, 12).forEach(function (error) {
      var item = document.createElement("li");
      item.textContent = error;
      list.append(item);
    });
    if (errors.length > 12) {
      var more = document.createElement("li");
      more.textContent = (errors.length - 12) + " more.";
      list.append(more);
    }
    box.append(lead, list);
    showStatus(box, "error");
  }

  function renderMetric(metric) {
    var card = document.createElement("article");
    card.className = "card";
    var label = document.createElement("p");
    label.className = "label";
    label.textContent = metric.label;
    var value = document.createElement("p");
    value.className = "value";
    value.textContent = formatMeasure(metric.value, metric.unit, metric.decimals);
    card.append(label, value);
    if (typeof metric.delta === "number") {
      var delta = document.createElement("p");
      delta.className = "delta";
      delta.textContent = formatDelta(metric.delta, metric.unit, metric.decimals);
      if (metric.deltaLabel) {
        var note = document.createElement("span");
        note.textContent = " " + metric.deltaLabel;
        delta.append(note);
      }
      card.append(delta);
    }
    return card;
  }

  function renderTable(chart) {
    var table = document.createElement("table");
    table.className = "sr-only";
    var caption = document.createElement("caption");
    caption.textContent = chart.title;
    var head = document.createElement("thead");
    var headRow = document.createElement("tr");
    var labelHead = document.createElement("th");
    labelHead.textContent = "Label";
    labelHead.scope = "col";
    var valueHead = document.createElement("th");
    valueHead.textContent = chart.unit ? "Value (" + chart.unit + ")" : "Value";
    valueHead.scope = "col";
    headRow.append(labelHead, valueHead);
    head.append(headRow);
    var body = document.createElement("tbody");
    chart.points.forEach(function (point) {
      var row = document.createElement("tr");
      var labelCell = document.createElement("th");
      labelCell.scope = "row";
      labelCell.textContent = point.label;
      var valueCell = document.createElement("td");
      valueCell.textContent = formatMeasure(point.value, chart.unit, chart.decimals);
      row.append(labelCell, valueCell);
      body.append(row);
    });
    table.append(caption, head, body);
    return table;
  }

  function renderChart(chart) {
    var section = document.createElement("section");
    section.className = "chart";
    var heading = document.createElement("h2");
    heading.textContent = chart.title;
    var plot = document.createElement("div");
    plot.className = "plot";
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    var tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    plot.append(canvas, tip);
    section.append(heading, plot, renderTable(chart));
    canvas.addEventListener("pointermove", function (event) {
      showTip(canvas, tip, event);
    });
    canvas.addEventListener("pointerleave", function () {
      tip.hidden = true;
    });
    return { section: section, canvas: canvas, chart: chart };
  }

  function paint(doc) {
    els.title.textContent = doc.title;
    document.title = doc.title;
    setLine(els.subtitle, doc.subtitle);
    setLine(els.updated, doc.updated ? formatUpdated(doc.updated) : "");
    setLine(els.compare, doc.compare);
    doc.metrics.forEach(function (metric) {
      els.metrics.append(renderMetric(metric));
    });
    var drawn = [];
    doc.charts.forEach(function (chart) {
      var view = renderChart(chart);
      els.charts.append(view.section);
      drawn.push(view);
    });
    requestAnimationFrame(function () {
      drawn.forEach(function (view) {
        draw(view.canvas, view.chart);
        var observer = new ResizeObserver(function () {
          draw(view.canvas, view.chart);
        });
        observer.observe(view.canvas.parentElement);
        observers.push(observer);
      });
    });
  }

  function applyData(data, sourceNote, problemName) {
    var result = validate(data);
    clearBoard();
    if (!result.ok) {
      resetHeader();
      showProblems(result.errors, problemName || "This file");
      return;
    }
    paint(result.value);
    setLine(els.source, sourceNote);
    if (!result.value.metrics.length && !result.value.charts.length) {
      showStatus("No metrics or charts in this file.");
    } else {
      showStatus("");
    }
  }

  function niceStep(raw) {
    if (!(raw > 0) || !Number.isFinite(raw)) return 1;
    var exp = Math.floor(Math.log10(raw) + 1e-12);
    var base = Math.pow(10, exp);
    var frac = raw / base;
    var nice = 10;
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 2.5) nice = 2.5;
    else if (frac <= 5) nice = 5;
    return Number((nice * base).toPrecision(8));
  }

  function roundToStep(value, step) {
    var text = String(step);
    var dot = text.indexOf(".");
    var digits = dot < 0 ? 0 : text.length - dot - 1;
    var factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function computeScale(values) {
    var dataMin = Math.min.apply(null, values);
    var dataMax = Math.max.apply(null, values);
    var lower = dataMin < 0 ? dataMin : 0;
    var upper = dataMax > 0 ? dataMax : 0;
    var step = niceStep(Math.max(Math.abs(lower), Math.abs(upper)) / 4);
    var axisMin = lower < 0 ? Math.floor(lower / step + 1e-9) * step : 0;
    var axisMax = upper > 0 ? Math.ceil(upper / step - 1e-9) * step : 0;
    if (upper > 0 && axisMax <= upper) axisMax += step;
    if (lower < 0 && axisMin >= lower) axisMin -= step;
    if (axisMin === 0 && axisMax === 0) axisMax = step;
    return {
      min: roundToStep(axisMin, step),
      max: roundToStep(axisMax, step),
      step: step,
    };
  }

  function tickList(scale) {
    var count = Math.round((scale.max - scale.min) / scale.step);
    var ticks = [];
    var i;
    for (i = 0; i <= count && i < 12; i += 1) {
      ticks.push(roundToStep(scale.min + i * scale.step, scale.step));
    }
    return ticks;
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var trimmed = text;
    while (trimmed.length > 1 && ctx.measureText(trimmed + "...").width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed + "...";
  }

  function labelStride(ctx, labels, slot) {
    var widest = 0;
    labels.forEach(function (label) {
      widest = Math.max(widest, ctx.measureText(label).width);
    });
    if (widest === 0 || slot <= 0) return 1;
    return Math.max(1, Math.ceil((widest + 8) / slot));
  }

  function draw(canvas, chart) {
    var tip = canvas.parentElement.querySelector(".tip");
    if (tip) tip.hidden = true;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (width < 10 || height < 10) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = "12px system-ui, sans-serif";

    var values = chart.points.map(function (point) { return point.value; });
    var scale = computeScale(values);
    var ticks = tickList(scale);
    var tickLabels = ticks.map(function (tick) { return formatTick(tick, chart.unit); });
    var labelWidth = 0;
    ctx.textBaseline = "middle";
    tickLabels.forEach(function (label) {
      labelWidth = Math.max(labelWidth, ctx.measureText(label).width);
    });

    var count = chart.points.length;
    var labels = chart.points.map(function (point) { return point.label; });
    var widestLabel = 0;
    labels.forEach(function (label) {
      widestLabel = Math.max(widestLabel, ctx.measureText(label).width);
    });
    var plotLeft = Math.ceil(labelWidth) + 12;
    var plotRight = width - 8;
    var slot = count ? (plotRight - plotLeft) / count : 0;
    var rotateLabels = widestLabel > slot - 6;
    var bottomPad = rotateLabels
      ? Math.min(84, Math.ceil(widestLabel * MathSIN45) + 18)
      : 28;

    var plot = {
      left: plotLeft,
      right: plotRight,
      top: 14,
      bottom: height - bottomPad,
    };
    if (plot.right - plot.left < 24 || plot.bottom - plot.top < 24) return;

    function yOf(value) {
      var t = (value - scale.min) / (scale.max - scale.min);
      return plot.bottom - t * (plot.bottom - plot.top);
    }

    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ticks.forEach(function (tick) {
      var y = Math.round(yOf(tick)) + 0.5;
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
    });
    ctx.stroke();

    if (scale.min < 0 && scale.max > 0) {
      ctx.strokeStyle = ZERO;
      ctx.beginPath();
      var zeroY = Math.round(yOf(0)) + 0.5;
      ctx.moveTo(plot.left, zeroY);
      ctx.lineTo(plot.right, zeroY);
      ctx.stroke();
    }

    ctx.fillStyle = MUTED;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ticks.forEach(function (tick, index) {
      ctx.fillText(tickLabels[index], plot.left - 8, yOf(tick));
    });

    if (rotateLabels) {
      var rotatedStride = slot < 14 ? Math.ceil(14 / slot) : 1;
      var maxLabel = Math.max(24, (bottomPad - 16) / MathSIN45);
      chart.points.forEach(function (point, index) {
        if (index % rotatedStride !== 0) return;
        var text = fitText(ctx, point.label, maxLabel);
        var x = plot.left + slot * index + slot / 2;
        ctx.save();
        ctx.translate(x, plot.bottom + 8);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 0, 0);
        ctx.restore();
      });
    } else {
      var stride = labelStride(ctx, labels, slot);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      chart.points.forEach(function (point, index) {
        if (index % stride !== 0) return;
        var text = fitText(ctx, point.label, Math.max(12, slot * stride - 6));
        var textWidth = ctx.measureText(text).width;
        var x = plot.left + slot * index + slot / 2;
        if (x - textWidth / 2 < 0) x = textWidth / 2;
        if (x + textWidth / 2 > width) x = width - textWidth / 2;
        ctx.fillText(text, x, plot.bottom + 8);
      });
    }

    var coords = chart.points.map(function (point, index) {
      return {
        x: plot.left + slot * index + slot / 2,
        y: yOf(point.value),
      };
    });

    if (chart.type === "line") {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (coords.length > 1) {
        ctx.beginPath();
        coords.forEach(function (coord, index) {
          if (index === 0) ctx.moveTo(coord.x, coord.y);
          else ctx.lineTo(coord.x, coord.y);
        });
        ctx.stroke();
      }
      ctx.fillStyle = INK;
      coords.forEach(function (coord) {
        ctx.beginPath();
        ctx.arc(coord.x, coord.y, 3.25, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      var baseY = yOf(0);
      ctx.fillStyle = INK;
      coords.forEach(function (coord) {
        var barWidth = Math.max(1, Math.round(Math.min(64, slot * 0.64)));
        var top = Math.min(coord.y, baseY);
        var barHeight = Math.max(1, Math.round(Math.abs(baseY - coord.y)));
        ctx.fillRect(Math.round(coord.x - barWidth / 2), Math.round(top), barWidth, barHeight);
      });
    }

    hits.set(canvas, {
      plot: plot,
      slot: slot,
      coords: coords,
      chart: chart,
      width: width,
    });
  }

  function showTip(canvas, tip, event) {
    var hit = hits.get(canvas);
    if (!hit) return;
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    if (x < hit.plot.left || x > hit.plot.right || y < hit.plot.top - 12 || y > hit.plot.bottom + 8) {
      tip.hidden = true;
      return;
    }
    var index = Math.floor((x - hit.plot.left) / hit.slot);
    index = Math.max(0, Math.min(hit.chart.points.length - 1, index));
    var point = hit.chart.points[index];
    var coord = hit.coords[index];
    tip.hidden = false;
    tip.textContent = point.label + ": " + formatMeasure(point.value, hit.chart.unit, hit.chart.decimals);
    var half = tip.offsetWidth / 2;
    var shift = 0;
    if (coord.x - half < 4) shift = half - coord.x + 4;
    if (coord.x + half > hit.width - 4) shift = hit.width - 4 - coord.x - half;
    var above = coord.y > 36;
    tip.style.left = coord.x + "px";
    tip.style.top = coord.y + "px";
    tip.style.transform = above
      ? "translate(calc(-50% + " + shift + "px), calc(-100% - 8px))"
      : "translate(calc(-50% + " + shift + "px), 8px)";
  }

  function resolveSrc() {
    var raw = new URLSearchParams(location.search).get("src");
    if (raw == null || raw === "") return { url: "results.json" };
    if (!/^[A-Za-z0-9._/-]+$/.test(raw) || raw.indexOf("..") !== -1 || raw.charAt(0) === "/") {
      return { error: "src must be a relative path to a JSON file in this folder." };
    }
    return { url: raw };
  }

  function loadUrl() {
    var src = resolveSrc();
    if (src.error) {
      clearBoard();
      resetHeader();
      showStatus(src.error, "error");
      return;
    }
    showStatus("Loading " + src.url + ".");
    fetch(src.url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) {
        var httpError = new Error("http");
        httpError.status = response.status;
        throw httpError;
      }
      return response.text();
    }).then(function (text) {
      if (text == null) return;
      var data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        clearBoard();
        resetHeader();
        showStatus("Could not parse " + src.url + ".", "error");
        return;
      }
      applyData(data, "", src.url);
    }).catch(function (error) {
      clearBoard();
      resetHeader();
      if (error && error.message === "http") {
        showStatus("Could not load " + src.url + " (" + error.status + "). Serve this folder over HTTP, or load a file.", "error");
        return;
      }
      showStatus("Could not load " + src.url + ". Serve this folder over HTTP, or load a file.", "error");
    });
  }

  els.file.addEventListener("change", function () {
    var file = els.file.files && els.file.files[0];
    els.file.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (error) {
        clearBoard();
        resetHeader();
        showStatus("Could not parse " + file.name + ".", "error");
        return;
      }
      applyData(data, "Showing " + file.name + ".", file.name);
    };
    reader.onerror = function () {
      clearBoard();
      resetHeader();
      showStatus("Could not read " + file.name + ".", "error");
    };
    reader.readAsText(file, "utf-8");
  });

  loadUrl();
})();
