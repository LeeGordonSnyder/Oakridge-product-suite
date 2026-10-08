"use strict";

function setOffline(isOffline) {
  document.getElementById("offline-badge").hidden = !isOffline;
}

window.addEventListener("online", () => setOffline(false));
window.addEventListener("offline", () => setOffline(true));

let refreshing = null;

// Re-pulls every shared sheet and re-renders whatever's open.
function refreshSharedData() {
  if (refreshing) return refreshing;
  const btn = document.getElementById("refresh-btn");
  btn.classList.add("spinning");
  refreshing = loadAllShared()
    .then((ok) => {
      refreshCurrentView();
      if (!ok) toast("Couldn't reach the sheet — showing what's saved on this phone.", true);
      return ok;
    })
    .finally(() => {
      btn.classList.remove("spinning");
      refreshing = null;
    });
  return refreshing;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // A controller already present means an earlier visit's worker is
  // running this page; a later controllerchange is then a real update.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) document.getElementById("update-banner").hidden = false;
  });
  document.getElementById("update-reload-btn").addEventListener("click", () => window.location.reload());
}

document.addEventListener("DOMContentLoaded", async () => {
  initScannerModal();
  initChangeUser();
  initSettings();
  document.getElementById("refresh-btn").addEventListener("click", refreshSharedData);
  setOffline(!navigator.onLine);
  registerServiceWorker();

  // The roster lives in the sheet, so fetch it before the gate renders
  // (falls back to whatever's cached, or the built-in list).
  await loadSharedStaffInitials();

  initLoginGate(async () => {
    document.getElementById("boot-loading").hidden = false;
    await loadAllShared();
    document.getElementById("boot-loading").hidden = true;

    // Each view initializes independently — one view tripping over odd
    // data must not take the rest of the app down with it.
    for (const [id, view] of Object.entries(VIEWS)) {
      try {
        view.init(document.getElementById(`view-${id}`));
      } catch (e) {
        console.error(`Failed to initialize ${id}:`, e);
      }
    }

    window.addEventListener("hashchange", applyRoute);
    document.getElementById("app").hidden = false;
    applyRoute();
  });
});
