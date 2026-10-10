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

/* ---------- Your shift today ----------
   Read from the Deployment tab in the sheet (built each morning from When I
   Work, then edited by leads as the day changes), matched on the signed-in
   person's initials via the sheet's "Staff Calendars" tab. */

function fmtClock(min) {
  const h24 = Math.floor(min / 60), m = min % 60;
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, "0")}${h24 < 12 ? "am" : "pm"}`;
}

function myDeployment() {
  const saved = loadJSON(STORE.deployment, null);
  if (!saved || !saved.deployment) return null;
  const d = saved.deployment;
  const me = currentInitials().toUpperCase();
  const person = (d.people || []).find((p) => (p.initials || "").toUpperCase() === me) || null;
  const codes = Object.fromEntries((saved.codes || []).map((c) => [c.code, c]));
  return { d, person, codes, isToday: d.date === todayISO() };
}

function renderShiftCard() {
  const el = document.getElementById("home-shift");
  const info = myDeployment();
  if (!info) {
    el.hidden = true; // backend not set up for deployments (yet)
    return;
  }
  el.hidden = false;
  const { d, person, codes, isToday } = info;
  if (!isToday) {
    el.innerHTML = `<div class="shift-head"><span class="kicker-sm">Your shift today</span></div>
      <p class="hint">Today's deployment hasn't been built yet${d.label ? ` (latest is ${escapeHtml(d.label)})` : ""}.</p>`;
    return;
  }
  if (!person || !person.blocks.length) {
    el.innerHTML = `<div class="shift-head"><span class="kicker-sm">Your shift today</span></div>
      <p class="hint">You're not on today's deployment. If that's wrong, check your initials are on the “Staff Calendars” tab, or ask a lead.</p>`;
    return;
  }
  const now = (() => { const t = new Date(); return t.getHours() * 60 + t.getMinutes(); })();
  const span = person.end - person.start;
  const worked = person.blocks.filter((b) => b.code !== "B").reduce((a, b) => a + (b.end - b.start), 0);
  const style = (code) => {
    const c = codes[code];
    return c ? `background:${c.bg};color:${c.fg}` : "background:#ddd;color:#333";
  };
  const label = (code) => (codes[code] ? codes[code].label : code);
  const bar = person.blocks
    .map((b) => `<span class="seg" style="${style(b.code)};flex:${b.end - b.start}" title="${escapeHtml(label(b.code))}"></span>`)
    .join("");
  const marker = now > person.start && now < person.end
    ? `<span class="now-marker" style="left:${(((now - person.start) / span) * 100).toFixed(2)}%"></span>`
    : "";
  const status = now < person.start
    ? `Starts in ${formatDuration(person.start - now)}`
    : now >= person.end
    ? "Shift finished — nice work"
    : `On now · done in ${formatDuration(person.end - now)}`;
  const rows = person.blocks
    .map((b) => {
      const current = now >= b.start && now < b.end;
      return `<li class="${current ? "current" : ""}${now >= b.end ? " past" : ""}">
        <span class="code-chip" style="${style(b.code)}">${escapeHtml(b.code)}</span>
        <span class="blk-label">${escapeHtml(label(b.code))}${current ? ' <span class="pill pill-ok">now</span>' : ""}</span>
        <span class="blk-time">${fmtClock(b.start)} – ${fmtClock(b.end)}</span>
      </li>`;
    })
    .join("");
  el.innerHTML = `
    <div class="shift-head">
      <span class="kicker-sm">Your shift today · ${escapeHtml(d.label || "")}</span>
      <span class="hint">${escapeHtml(status)}</span>
    </div>
    <div class="shift-times"><strong>${fmtClock(person.start)}</strong> – <strong>${fmtClock(person.end)}</strong>
      <span class="hint">· ${formatDuration(worked)} on the floor</span></div>
    <div class="shift-bar">${bar}${marker}</div>
    <div class="shift-axis"><span>${fmtClock(person.start)}</span><span>${fmtClock(person.end)}</span></div>
    <ul class="shift-blocks">${rows}</ul>`;
}

function formatDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? " " + m + "m" : ""}` : `${m}m`;
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

    renderShiftCard();

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
