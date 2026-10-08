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

function initLoginGate(onReady) {
  const select = document.getElementById("login-select");
  renderInitialsOptions(select, "");
  wireAddInitials("login", select);

  document.getElementById("login-continue").addEventListener("click", () => {
    if (!select.value) {
      setStatus("login-status", "Pick your initials first.", true);
      return;
    }
    setSessionInitials(select.value);
    closeModal("login-gate");
    onReady();
  });
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
