"use strict";

/* ---------- Floor Stock ----------
   Check Floor, Replen, and the 86 Board as three views of one lifecycle on
   one sheet (FloorRestock), each line carrying the same progress strip:
   Check → Needed → Picked | Out of Stock → Restocked.
   Check Floor and Replen decisions stage in Holding and push on Update;
   Restocked on the 86 Board pushes immediately, as before. */

let floorSub = "check";
let floorNeededTarget = null; // { sku, size } being sized in the Needed modal
let floorManualDescription = "";

const FLOOR_SUBS = ["check", "replen", "86"];

function loadRestock() {
  return loadJSON(STORE.floorRestock, []);
}

// sku+size isn't unique over time (sell out, restock, sell out again), so
// every match also checks the row is at the right lifecycle stage.
function findRestockRow(restock, sku, size, predicate) {
  return restock.find((p) => p.sku === sku && p.size === size && predicate(p)) || null;
}

const floorHolding = {
  check: {
    key: STORE.checkFloorHolding,
    has: (sku, size) => loadJSON(STORE.checkFloorHolding, []).some((h) => h.sku === sku && h.size === size),
  },
  replen: {
    key: STORE.replenHolding,
    has: (sku, size) => loadJSON(STORE.replenHolding, []).some((h) => h.sku === sku && h.size === size),
  },
};

function stageFloor(which, entry) {
  const h = loadJSON(floorHolding[which].key, []);
  if (h.some((x) => x.sku === entry.sku && x.size === entry.size)) return;
  h.push(entry);
  saveJSON(floorHolding[which].key, h);
  renderFloor();
}

function unstageFloor(which, sku, size) {
  saveJSON(
    floorHolding[which].key,
    loadJSON(floorHolding[which].key, []).filter((h) => !(h.sku === sku && h.size === size))
  );
  renderFloor();
}

/* ---------- Sub-view switching ---------- */

function setFloorSub(sub) {
  floorSub = FLOOR_SUBS.includes(sub) ? sub : "check";
  saveJSON(STORE.floorView, floorSub);
  document.querySelectorAll("#floor-tabs [data-sub]").forEach((b) => {
    const on = b.dataset.sub === floorSub;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  FLOOR_SUBS.forEach((s) => (document.getElementById(`floor-panel-${s}`).hidden = s !== floorSub));
}

/* ---------- Line rendering ---------- */

function floorLine(item, buttons) {
  return `
    <div class="line-card">
      <div class="line-main">
        <div class="line-title">${escapeHtml(item.description)}${item.size ? ` <span class="size-tag">${escapeHtml(item.size)}</span>` : ""}</div>
        <div class="line-sub">${escapeHtml(item.color || "")}${item.color ? " · " : ""}<span class="mono">${escapeHtml(item.sku)}</span>${
    item.qtySold || item.onHand ? ` · sold ${item.qtySold} · on hand ${item.onHand}` : ""
  }</div>
        ${floorStageStrip(item)}
      </div>
      <div class="line-controls">${buttons}</div>
    </div>`;
}

function holdingRows(which, rows, labelFn) {
  if (!rows.length) return `<p class="hint">Nothing staged.</p>`;
  return rows
    .map(
      (h) => `
      <div class="list-row static">
        <span>${escapeHtml(h.description)}${h.color ? " — " + escapeHtml(h.color) : ""} ${h.size ? `<span class="size-tag">${escapeHtml(h.size)}</span>` : ""}<br>
          <span class="hint">${escapeHtml(labelFn(h))}</span></span>
        <button type="button" class="btn secondary small" data-action="floor-unstage" data-which="${which}" data-sku="${escapeHtml(
        h.sku
      )}" data-size="${escapeHtml(h.size)}">Remove</button>
      </div>`
    )
    .join("");
}

function renderFloorCounts(restock) {
  const nCheck = restock.filter((i) => !isFloorChecked(i)).length;
  const nReplen = restock.filter(isFloorNeeded).length;
  const n86 = restock.filter(isFloorOn86).length;
  document.getElementById("floor-n-check").textContent = nCheck || "";
  document.getElementById("floor-n-replen").textContent = nReplen || "";
  document.getElementById("floor-n-86").textContent = n86 || "";

  const checked = restock.filter((i) => i.checkedDate);
  const el = document.getElementById("floor-last-check");
  if (!checked.length) {
    el.textContent = "Floor not checked yet.";
  } else {
    const latest = checked.reduce((a, b) => (new Date(a.checkedDate) > new Date(b.checkedDate) ? a : b));
    el.textContent = `Last checked ${new Date(latest.checkedDate).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })} by ${latest.checkedBy || "—"}`;
  }
}

function renderCheckPanel(restock) {
  const holding = loadJSON(STORE.checkFloorHolding, []);
  document.getElementById("floor-check-holding-count").textContent = holding.length ? `${holding.length} staged` : "";
  document.getElementById("floor-check-update").disabled = !holding.length;
  document.getElementById("floor-check-holding").innerHTML = holdingRows("check", holding, (h) =>
    h.status === "Needed" ? `Needed · sizes ${h.sizes.join(", ")}` : "Not needed"
  );

  const filter = normalize(document.getElementById("floor-check-filter").value);
  const remaining = restock.filter((i) => !isFloorChecked(i) && !floorHolding.check.has(i.sku, i.size));
  const shown = remaining.filter((i) => !filter || [i.description, i.sku, i.color].some((f) => normalize(f).includes(filter)));
  document.getElementById("floor-check-count").textContent = `${shown.length} of ${remaining.length} to check`;

  const el = document.getElementById("floor-check-list");
  el.innerHTML = shown.length
    ? shown
        .slice()
        .sort((a, b) => a.description.localeCompare(b.description))
        .map((i) =>
          floorLine(
            i,
            `<button type="button" class="btn primary small" data-action="floor-needed" data-sku="${escapeHtml(i.sku)}" data-size="${escapeHtml(
              i.size
            )}">Needed</button>
             <button type="button" class="btn secondary small" data-action="floor-not-needed" data-sku="${escapeHtml(i.sku)}" data-size="${escapeHtml(
              i.size
            )}">Not needed</button>`
          )
        )
        .join("")
    : `<p class="no-results">${
        restock.length === 0
          ? "No sold items — paste MAO's Items Sold export into the FloorRestock sheet, then tap ↻."
          : remaining.length === 0
          ? "Everything's been checked."
          : "No items match that filter."
      }</p>`;
}

function renderReplenPanel(restock) {
  const holding = loadJSON(STORE.replenHolding, []);
  document.getElementById("floor-replen-holding-count").textContent = holding.length ? `${holding.length} staged` : "";
  document.getElementById("floor-replen-update").disabled = !holding.length;
  document.getElementById("floor-replen-holding").innerHTML = holdingRows("replen", holding, (h) =>
    h.action === "picked" ? "Picked" : "Out of stock → 86 Board"
  );

  const remaining = restock.filter((i) => isFloorNeeded(i) && !floorHolding.replen.has(i.sku, i.size));
  document.getElementById("floor-replen-count").textContent = `${plural(remaining.length, "item")} to pick`;
  document.getElementById("floor-replen-list").innerHTML = remaining.length
    ? remaining
        .slice()
        .sort((a, b) => a.description.localeCompare(b.description))
        .map((i) => {
          const age = daysAgo(i.checkedDate);
          const stale = age != null && age >= FLOOR_NEEDED_STALE_DAYS;
          return floorLine(
            { ...i, color: i.color + (stale ? ` · needed ${formatAge(age)}` : "") },
            `<button type="button" class="btn primary small" data-action="floor-picked" data-sku="${escapeHtml(i.sku)}" data-size="${escapeHtml(
              i.size
            )}">Picked</button>
             <button type="button" class="btn secondary small" data-action="floor-oos" data-sku="${escapeHtml(i.sku)}" data-size="${escapeHtml(
              i.size
            )}">Out of stock</button>`
          );
        })
        .join("")
    : `<p class="no-results">Nothing to pick right now.</p>`;
}

function render86Panel(restock) {
  const out = restock.filter(isFloorOn86).sort((a, b) => new Date(b.outOfStock) - new Date(a.outOfStock));
  document.getElementById("floor-86-count").textContent = `${plural(out.length, "item")} out of stock`;
  document.getElementById("floor-86-list").innerHTML = out.length
    ? out
        .map((i) =>
          floorLine(
            { ...i, color: `${i.color}${i.color ? " · " : ""}86'd ${formatDay(i.outOfStock)}` },
            `<button type="button" class="btn primary small" data-action="floor-restocked" data-sku="${escapeHtml(i.sku)}" data-size="${escapeHtml(
              i.size
            )}">Restocked</button>`
          )
        )
        .join("")
    : `<p class="no-results">Nothing on the 86 Board.</p>`;
}

function renderFloor() {
  const restock = loadRestock();
  renderFloorCounts(restock);
  renderCheckPanel(restock);
  renderReplenPanel(restock);
  render86Panel(restock);
}

/* ---------- Check Floor: Needed modal (pick sizes) ---------- */

function sizeCheckboxes(containerId, cls, otherId, otherLabel) {
  document.getElementById(containerId).innerHTML =
    FLOOR_CORE_SIZES.map(
      (s) => `<label class="size-check"><input type="checkbox" class="${cls}" value="${escapeHtml(s)}"><span>${escapeHtml(s)}</span></label>`
    ).join("") + `<label class="size-check"><input type="checkbox" id="${otherId}"><span>${escapeHtml(otherLabel)}</span></label>`;
}

function openNeededModal(sku, size) {
  const item = findRestockRow(loadRestock(), sku, size, (p) => !isFloorChecked(p));
  if (!item) return;
  floorNeededTarget = { sku, size };
  document.getElementById("floor-needed-label").textContent = `${item.description}${item.color ? " — " + item.color : ""} (sold in ${item.size || "—"})`;
  sizeCheckboxes("floor-needed-sizes", "floor-needed-size", "floor-needed-other", "Other (any size)");
  setStatus("floor-needed-status", "", false);
  openModal("floor-needed-modal");
}

function saveNeededModal() {
  if (!floorNeededTarget) return;
  const wrap = document.getElementById("floor-needed-sizes");
  const picked = [...wrap.querySelectorAll(".floor-needed-size:checked")].map((cb) => cb.value);
  const sizes = document.getElementById("floor-needed-other").checked ? ["Other"] : picked;
  if (!sizes.length) {
    setStatus("floor-needed-status", "Pick at least one size, or Other.", true);
    return;
  }
  const { sku, size } = floorNeededTarget;
  floorNeededTarget = null;
  closeModal("floor-needed-modal");
  stageCheckDecision(sku, size, "Needed", sizes);
}

function stageCheckDecision(sku, size, status, sizes) {
  const item = findRestockRow(loadRestock(), sku, size, (p) => !isFloorChecked(p));
  if (!item) return;
  stageFloor("check", { sku, size, description: item.description, color: item.color, status, sizes });
}

async function commitCheckFloor(btn) {
  const holding = loadJSON(STORE.checkFloorHolding, []);
  if (!holding.length || !requireOnline("floor-check-status", "updated")) return;
  const initials = currentInitials();
  const date = todayISO();
  const nowIso = new Date().toISOString();
  setStatus("floor-check-status", `Updating ${plural(holding.length, "item")}…`, false);

  await withBusy(btn, async () => {
    try {
      await api.checkFloorUpdate({
        initials,
        date,
        decisions: holding.map((h) => ({ sku: h.sku, size: h.size, status: h.status, sizes: h.sizes })),
      });
      // Mirror the server: stamp the row, and a Needed decision adds one new
      // "Needed" row per extra size picked besides the row's own.
      const restock = loadRestock();
      for (const h of holding) {
        const row = findRestockRow(restock, h.sku, h.size, (p) => !isFloorChecked(p));
        if (!row) continue;
        row.status = h.status;
        row.checkedBy = initials;
        row.checkedDate = nowIso;
        if (h.status === "Needed") {
          for (const size of h.sizes.filter((s) => s !== h.size)) {
            restock.push({
              ...row,
              size,
              qtySold: 0,
              onHand: 0,
              status: "Needed",
              outOfStock: "",
              restocked: "",
            });
          }
        }
      }
      saveJSON(STORE.floorRestock, restock);
      saveJSON(STORE.checkFloorHolding, []);
      renderFloor();
      updateExceptionBadge();
      setStatus("floor-check-status", `Updated ${plural(holding.length, "item")}. Needed items are on Replen now.`, false);
    } catch (e) {
      setStatus("floor-check-status", "Couldn't reach the sheet — items stay staged. Try again.", true);
    }
  });
}

/* ---------- Check Floor: add a product that isn't on the sold list ---------- */

async function addCatalogProductToCheck(sku) {
  const item = findProductBySku(sku);
  if (!item) return;
  const restock = loadRestock();
  if (findRestockRow(restock, item.sku, item.size, (p) => !isFloorChecked(p))) {
    setStatus("floor-lookup-status", "Already on the Check Floor list.", true);
    return;
  }
  if (!requireOnline("floor-lookup-status", "added")) return;
  setStatus("floor-lookup-status", "Adding…", false);
  try {
    await api.floorRestockAdd({ sku: item.sku, size: item.size, description: item.description, color: item.color });
    restock.push(blankRestockRow({ sku: item.sku, size: item.size, description: item.description, color: item.color }));
    saveJSON(STORE.floorRestock, restock);
    document.getElementById("floor-search").value = "";
    renderFloorSearch();
    renderFloor();
    setStatus("floor-lookup-status", `Added ${combinedDescription(item)} to Check Floor.`, false);
  } catch (e) {
    setStatus("floor-lookup-status", "Couldn't reach the sheet — try again.", true);
  }
}

function blankRestockRow(fields) {
  return {
    gender: "",
    category: "",
    description: "",
    color: "",
    size: "",
    sku: "",
    qtySold: 0,
    onHand: 0,
    status: "",
    checkedBy: "",
    checkedDate: "",
    outOfStock: "",
    restocked: "",
    ...fields,
  };
}

function renderFloorSearch() {
  const q = document.getElementById("floor-search").value.trim();
  renderProductResults(document.getElementById("floor-results"), q, { action: "floor-add-product", actionLabel: "Add" });
  const manual = document.getElementById("floor-manual-btn");
  manual.hidden = !q;
  manual.textContent = `Not in the catalog? Add "${q}" by hand…`;
}

// Not on the sold list or in the catalog at all: whatever's typed in the
// search becomes the description, with a synthetic SKU so it flows through
// the same sku+size lifecycle as every other row. Staged as Needed.
function openManualModal() {
  const description = document.getElementById("floor-search").value.trim();
  if (!description) return;
  floorManualDescription = description;
  document.getElementById("floor-manual-label").textContent = description;
  sizeCheckboxes("floor-manual-sizes", "floor-manual-size", "floor-manual-other", "Other");
  const other = document.getElementById("floor-manual-other-size");
  other.value = "";
  other.hidden = true;
  document.getElementById("floor-manual-other").addEventListener("change", (e) => {
    other.hidden = !e.target.checked;
    if (e.target.checked) other.focus();
  });
  setStatus("floor-manual-status", "", false);
  openModal("floor-manual-modal");
}

async function saveManualEntry() {
  const sizes = [...document.querySelectorAll(".floor-manual-size:checked")].map((cb) => cb.value);
  const otherSize = document.getElementById("floor-manual-other-size").value.trim();
  if (document.getElementById("floor-manual-other").checked && otherSize) sizes.push(otherSize);
  if (!sizes.length) {
    setStatus("floor-manual-status", "Pick at least one size, or enter one under Other.", true);
    return;
  }
  if (!requireOnline("floor-manual-status", "added")) return;

  const description = floorManualDescription;
  const sku = "MANUAL-" + uid();
  const ownSize = sizes[0];
  closeModal("floor-manual-modal");
  setStatus("floor-lookup-status", "Adding…", false);
  try {
    await api.floorRestockAdd({ sku, size: ownSize, description, color: "" });
    const restock = loadRestock();
    restock.push(blankRestockRow({ sku, size: ownSize, description }));
    saveJSON(STORE.floorRestock, restock);
    stageCheckDecision(sku, ownSize, "Needed", sizes);
    document.getElementById("floor-search").value = "";
    renderFloorSearch();
    setStatus("floor-lookup-status", `Added ${description} — staged as Needed. Tap Update to push it.`, false);
  } catch (e) {
    setStatus("floor-lookup-status", "Couldn't reach the sheet — try again.", true);
  }
}

/* ---------- Replen ---------- */

function stageReplen(sku, size, action) {
  const item = findRestockRow(loadRestock(), sku, size, isFloorNeeded);
  if (!item) return;
  stageFloor("replen", { sku, size, description: item.description, color: item.color, action });
}

async function commitReplen(btn) {
  const holding = loadJSON(STORE.replenHolding, []);
  if (!holding.length || !requireOnline("floor-replen-status", "updated")) return;
  const nowIso = new Date().toISOString();
  setStatus("floor-replen-status", `Updating ${plural(holding.length, "item")}…`, false);

  await withBusy(btn, async () => {
    try {
      await api.floorPickUpdate({ date: todayISO(), decisions: holding.map((h) => ({ sku: h.sku, size: h.size, action: h.action })) });
      const restock = loadRestock();
      for (const h of holding) {
        const row = findRestockRow(restock, h.sku, h.size, isFloorNeeded);
        if (!row) continue;
        row.status = h.action === "picked" ? "Picked" : "Out of Stock";
        if (h.action === "outOfStock") row.outOfStock = nowIso;
      }
      saveJSON(STORE.floorRestock, restock);
      saveJSON(STORE.replenHolding, []);
      renderFloor();
      updateExceptionBadge();
      setStatus("floor-replen-status", `Updated ${plural(holding.length, "item")}.`, false);
    } catch (e) {
      setStatus("floor-replen-status", "Couldn't reach the sheet — items stay staged. Try again.", true);
    }
  });
}

/* ---------- 86 Board ---------- */

async function markRestocked(sku, size, btn) {
  if (!requireOnline("floor-86-status", "updated")) return;
  await withBusy(btn, async () => {
    try {
      await api.floor86Restock({ date: todayISO(), items: [{ sku, size }] });
      const restock = loadRestock();
      const row = findRestockRow(restock, sku, size, isFloorOn86);
      if (row) row.restocked = new Date().toISOString();
      saveJSON(STORE.floorRestock, restock);
      renderFloor();
      toast("Marked restocked");
    } catch (e) {
      setStatus("floor-86-status", "Couldn't reach the sheet — try again.", true);
    }
  });
}

registerView("floor", {
  init(root) {
    floorSub = loadJSON(STORE.floorView, "check");
    document.getElementById("floor-check-filter").addEventListener("input", () => renderCheckPanel(loadRestock()));
    document.getElementById("floor-search").addEventListener("input", renderFloorSearch);
    document.getElementById("floor-needed-save-btn").addEventListener("click", saveNeededModal);
    // "Other" means any size will do — exclusive with picking specific ones.
    const neededWrap = document.getElementById("floor-needed-sizes");
    neededWrap.addEventListener("change", (e) => {
      if (e.target.id === "floor-needed-other" && e.target.checked) {
        neededWrap.querySelectorAll(".floor-needed-size").forEach((cb) => (cb.checked = false));
      } else if (e.target.classList.contains("floor-needed-size") && e.target.checked) {
        document.getElementById("floor-needed-other").checked = false;
      }
    });
    document.getElementById("floor-manual-save-btn").addEventListener("click", saveManualEntry);

    onAction(root, {
      "floor-tab": (el) => goTo(`floor/${el.dataset.sub}`),
      "floor-needed": (el) => openNeededModal(el.dataset.sku, el.dataset.size),
      "floor-not-needed": (el) => stageCheckDecision(el.dataset.sku, el.dataset.size, "Not Needed", []),
      "floor-unstage": (el) => unstageFloor(el.dataset.which, el.dataset.sku, el.dataset.size),
      "floor-check-update": commitCheckFloor,
      "floor-add-product": (el) => addCatalogProductToCheck(el.dataset.sku),
      "floor-manual": openManualModal,
      "floor-picked": (el) => stageReplen(el.dataset.sku, el.dataset.size, "picked"),
      "floor-oos": (el) => stageReplen(el.dataset.sku, el.dataset.size, "outOfStock"),
      "floor-replen-update": commitReplen,
      "floor-restocked": (el) => markRestocked(el.dataset.sku, el.dataset.size, el),
    });
  },

  show(sub) {
    setFloorSub(sub || floorSub);
    renderFloorSearch();
    renderFloor();
  },
});
