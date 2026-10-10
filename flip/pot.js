(function () {
  var script = document.currentScript;
  var dataUrl = new URL("flips.json", script && script.src ? script.src : document.baseURI);

  var app = document.getElementById("app");
  var potEl = document.getElementById("pot");
  var pnlEl = document.getElementById("pnl");
  var noteEl = document.getElementById("note");
  var historyEl = document.getElementById("history");

  var money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  function formatMoney(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    return money.format(n);
  }

  function formatSigned(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    if (n > 0) return "+" + money.format(n);
    if (n < 0) return "-" + money.format(Math.abs(n));
    return money.format(0);
  }

  function formatDate(value) {
    var text = String(value == null ? "" : value);
    var parts = text.split("-");
    if (parts.length !== 3) return text;
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var day = Number(parts[2]);
    var date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return text;
    }
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function cell(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    return el;
  }

  function showError(message) {
    potEl.textContent = message;
    pnlEl.textContent = "";
    noteEl.hidden = true;
    historyEl.textContent = "";
    if (app) app.setAttribute("aria-busy", "false");
  }

  function render(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      showError("Pot file is not a ledger.");
      return;
    }

    var current = Number(data.current_value);
    var seed = Number(data.seed);
    if (!Number.isFinite(current) || !Number.isFinite(seed)) {
      showError("Pot file is missing current_value or seed.");
      return;
    }

    var flips = Array.isArray(data.flips) ? data.flips : [];
    var pnl = current - seed;

    potEl.textContent = money.format(current);
    pnlEl.textContent =
      "P&L " + formatSigned(pnl) + " from a " + money.format(seed) + " seed.";

    if (data.sample === true) {
      noteEl.hidden = false;
      noteEl.textContent = "Sample numbers. Not the live pot yet.";
    } else {
      noteEl.hidden = true;
      noteEl.textContent = "";
    }

    historyEl.textContent = "";
    if (flips.length === 0) {
      historyEl.appendChild(cell("p", "empty", "No flips yet."));
      if (app) app.setAttribute("aria-busy", "false");
      return;
    }

    var table = document.createElement("table");
    var caption = document.createElement("caption");
    caption.className = "sr";
    caption.textContent = "Flip history";
    table.appendChild(caption);

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    ["Item", "Bought", "Sold", "Profit", "Date"].forEach(function (label, i) {
      var th = cell("th", i === 0 || i === 4 ? "" : "num", label);
      th.scope = "col";
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    flips.forEach(function (flip) {
      var row = flip && typeof flip === "object" ? flip : {};
      var tr = document.createElement("tr");
      var item = cell("td", "", row.item == null ? "" : String(row.item));
      tr.appendChild(item);
      tr.appendChild(cell("td", "num", formatMoney(row.buy_price)));
      tr.appendChild(cell("td", "num", formatMoney(row.sold_price)));
      tr.appendChild(cell("td", "num", formatSigned(row.profit)));

      var dateCell = cell("td", "", formatDate(row.date));
      if (typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        var time = document.createElement("time");
        time.dateTime = row.date;
        time.textContent = dateCell.textContent;
        dateCell.textContent = "";
        dateCell.appendChild(time);
      }
      tr.appendChild(dateCell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var wrap = document.createElement("div");
    wrap.className = "table-wrap";
    wrap.appendChild(table);
    historyEl.appendChild(wrap);
    if (app) app.setAttribute("aria-busy", "false");
  }

  fetch(dataUrl, { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    })
    .then(render)
    .catch(function () {
      showError("Couldn't load the pot.");
    });
})();
