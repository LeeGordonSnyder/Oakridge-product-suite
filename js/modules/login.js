"use strict";

/* ---------- Who's working? ----------
   Asked on every fresh load (never remembered across launches) so a
   shared phone changing hands can't keep running under the last person's
   initials. Initials stamp every action; the date is always automatic. */

function renderInitialsOptions(select, preselect) {
  const roster = loadStaffRoster();
  select.innerHTML =
    `<option value="" disabled ${preselect ? "" : "selected"}>Select initials…</option>` +
    roster.map((i) => `<option value="${escapeHtml(i)}" ${i === preselect ? "selected" : ""}>${escapeHtml(i)}</option>`).join("");
}

function setSessionInitials(initials) {
  saveJSON(STORE.session, { initials });
  document.getElementById("header-user-initials").textContent = initials || "—";
}

function wireAddInitials(prefix, select) {
  const toggle = document.getElementById(`${prefix}-add-toggle`);
  const row = document.getElementById(`${prefix}-add-row`);
  const input = document.getElementById(`${prefix}-add-input`);
  toggle.addEventListener("click", () => {
    row.hidden = false;
    toggle.hidden = true;
    input.focus();
  });
  document.getElementById(`${prefix}-add-save`).addEventListener("click", () =>
    addStaffInitials(input, `${prefix}-add-status`, (initials) => {
      renderInitialsOptions(select, initials);
      row.hidden = true;
      toggle.hidden = false;
    })
  );
}

/* The access key lives on the sign-in screen too: a brand-new phone (or a
   home-screen install, which on iOS gets its own storage separate from
   Safari) has no key yet, and without one every sheet request is
   rejected. The key is checked against the backend before it's saved, so
   a typo is caught here instead of showing up later as an empty app. */
function showLoginKeyField(show) {
  document.getElementById("login-key-section").hidden = !show;
  document.getElementById("login-key-saved").hidden = show;
}

// Verifies whatever's typed in the key field. Resolves true when it's OK
// to carry on (key accepted, or the sheet's unreachable and we'll try it
// later), false when the key was rejected or left blank.
async function checkLoginKey() {
  const input = document.getElementById("login-key");
  const status = document.getElementById("login-key-status");
  const key = input.value.trim();
  if (document.getElementById("login-key-section").hidden) return true;
  if (!key) {
    if (getApiKey()) {
      showLoginKeyField(false);
      return true;
    }
    setStatus(status, "Enter the access key first.", true);
    input.focus();
    return false;
  }
  if (key === getApiKey()) {
    showLoginKeyField(false);
    return true;
  }
  setStatus(status, "Checking key…", false);
  const result = await verifyApiKey(key);
  if (result === "unauthorized") {
    setStatus(status, "That key was rejected — check it and try again.", true);
    input.focus();
    input.select();
    return false;
  }
  setApiKey(key);
  if (result === "unreachable") {
    setStatus(status, "Saved — couldn't reach the sheet to check it, so it'll be tried once you're connected.", true);
    return true;
  }
  setStatus(status, "", false);
  showLoginKeyField(false);
  return true;
}

function refreshLoginRoster(select) {
  const keep = select.value;
  return loadSharedStaffInitials().then(() => renderInitialsOptions(select, keep));
}

function initLoginGate(onReady) {
  const select = document.getElementById("login-select");
  renderInitialsOptions(select, "");
  wireAddInitials("login", select);
  showLoginKeyField(!getApiKey());

  // The roster comes from the sheet, but the gate never waits on it —
  // it shows straight away with whatever's cached and updates in place.
  refreshLoginRoster(select);

  const keyInput = document.getElementById("login-key");
  keyInput.addEventListener("change", async () => {
    if (keyInput.value.trim() && (await checkLoginKey())) refreshLoginRoster(select);
  });
  document.getElementById("login-key-change").addEventListener("click", () => {
    keyInput.value = "";
    showLoginKeyField(true);
    keyInput.focus();
  });

  const continueBtn = document.getElementById("login-continue");
  continueBtn.addEventListener("click", () =>
    withBusy(continueBtn, async () => {
      if (!(await checkLoginKey())) return;
      if (!select.value) {
        setStatus("login-status", "Pick your initials first.", true);
        return;
      }
      setSessionInitials(select.value);
      closeModal("login-gate");
      onReady();
    })
  );
  openModal("login-gate");
}

// Switch user mid-shift without re-running the app's boot sequence.
function initChangeUser() {
  const select = document.getElementById("user-select");
  wireAddInitials("user", select);
  document.getElementById("change-user-btn").addEventListener("click", () => {
    document.getElementById("user-current").textContent = currentInitials() || "nobody yet";
    renderInitialsOptions(select, currentInitials());
    openModal("user-modal");
  });
  document.getElementById("user-save").addEventListener("click", () => {
    if (!select.value) return;
    setSessionInitials(select.value);
    closeModal("user-modal");
    refreshCurrentView();
  });
}
