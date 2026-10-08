"use strict";

/* ---------- Home ----------
   The first screen after sign-in: what needs attention right now, a short
   set of KPIs, and one-tap shortcuts into the most common next step. */

function homeKpis() {
  const weekStart = startOfWeek();
  const inThisWeek = (value) => {
    const d = parseDay(value);
    return d && d >= weekStart;
  };

  const counts = loadJSON(STORE.auditLog, []).filter((e) => inThisWeek(e.date || e.timestamp));
  const within = counts.filter((e) => !isFlaggedVariance(e)).length;
  const accuracy = counts.length ? Math.round((within / counts.length) * 100) : null;

  const consolOpen = loadJSON(STORE.consolMaster, []).filter((i) => !isConsolProcessed(i)).length;
  const boxesThisWeek = loadJSON(STORE.receivingMaster, []).filter((b) => inThisWeek(b.physicallyReceivedDate)).length;
  const on86 = loadJSON(STORE.floorRestock, []).filter(isFloorOn86).length;

  return [
    {
      label: "Count accuracy",
      value: accuracy == null ? "—" : `${accuracy}%`,
      sub: counts.length ? `${plural(counts.length, "count")} this week` : "No counts this week",
      route: "counts",
    },
    { label: "Open consolidation lines", value: consolOpen, sub: "from HQ's list", route: "consol" },
    { label: "Boxes received", value: boxesThisWeek, sub: "this week", route: "receiving" },
    { label: "86 Board", value: on86, sub: on86 === 1 ? "item out of stock" : "items out of stock", route: "floor/86" },
  ];
}

registerView("home", {
  init(root) {
    onAction(root, {
      go: (el) => goTo(el.dataset.route),
      "quick-count": () => goTo("counts", startCountScan),
      "quick-packslip": () => goTo("consol", startBoxCloseScan),
      "quick-boxes": () => goTo("receiving", startReceivingScan),
    });
  },

  show() {
    const initials = currentInitials();
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("home-greeting").textContent = `${greet}${initials ? ", " + initials : ""}`;

    const lastSync = loadJSON(STORE.lastSync, null);
    document.getElementById("home-freshness").textContent = lastSync
      ? `Synced with the sheet ${new Date(lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "Not synced with the sheet yet";

    document.getElementById("home-kpis").innerHTML = homeKpis()
      .map(
        (k) => `
        <button type="button" class="kpi" data-action="go" data-route="${k.route}">
          <span class="kpi-value">${escapeHtml(k.value)}</span>
          <span class="kpi-label">${escapeHtml(k.label)}</span>
          <span class="kpi-sub">${escapeHtml(k.sub)}</span>
        </button>`
      )
      .join("");

    const exceptions = computeExceptions();
    const actionable = exceptions.filter((e) => e.severity !== "info").length;
    document.getElementById("home-exceptions-count").textContent = exceptions.length
      ? actionable
        ? `${actionable} to act on`
        : "Just notes"
      : "";

    const listEl = document.getElementById("home-exceptions");
    if (exceptions.length === 0) {
      listEl.innerHTML = `<div class="all-clear"><span class="all-clear-icon">✓</span><div><strong>All clear.</strong><br><span class="hint">Nothing waiting on anyone right now.</span></div></div>`;
      return;
    }
    listEl.innerHTML = exceptions
      .map(
        (ex) => `
        <article class="exception sev-${ex.severity}">
          <div class="exception-head">
            <span class="sev-dot" aria-hidden="true"></span>
            <h3>${escapeHtml(ex.title)}</h3>
          </div>
          <p class="exception-detail">${escapeHtml(ex.detail)}</p>
          ${
            ex.items && ex.items.length
              ? `<ul class="exception-items">${ex.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
              : ""
          }
          <button type="button" class="btn secondary small" data-action="go" data-route="${escapeHtml(ex.action.route)}">${escapeHtml(
          ex.action.label
        )} ›</button>
        </article>`
      )
      .join("");
  },
});
