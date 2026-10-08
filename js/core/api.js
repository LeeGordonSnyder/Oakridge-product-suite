"use strict";

/* ---------- Backend (Google Sheet via Apps Script) ----------
   Same endpoints, same payloads as the original app — the rebuild changes
   nothing server-side. Every request carries the shared access key; see
   "Securing the backend" in the original app's README. */

function getWebhookUrl() {
  return loadString(STORE.webhookUrl, LEGACY_KEYS.webhookUrl) || DEFAULT_WEBHOOK_URL;
}

function setWebhookUrl(url) {
  saveString(STORE.webhookUrl, url);
}

function getApiKey() {
  return loadString(STORE.apiKey, LEGACY_KEYS.apiKey);
}

function setApiKey(key) {
  saveString(STORE.apiKey, key);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Apps Script occasionally drops or times out a request under load; a few
// retries with backoff clears most of those without anyone noticing.
const SYNC_RETRIES = 3;
const SYNC_RETRY_DELAY_MS = 700;

async function postToSheet(payload, attempt = 1) {
  let data;
  try {
    const res = await fetch(getWebhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight Apps Script can't answer
      body: JSON.stringify({ ...payload, key: getApiKey() }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    // Apps Script answers 200 even when the handler throws (the body is an
    // HTML error page), so only a parseable JSON body counts as success.
    data = JSON.parse(await res.text());
  } catch (e) {
    if (attempt >= SYNC_RETRIES) throw e;
    await sleep(SYNC_RETRY_DELAY_MS * attempt);
    return postToSheet(payload, attempt + 1);
  }
  // A well-formed failure isn't a blip a retry would fix — surface it.
  if (data.ok === false) throw new Error(data.error || "Request failed");
  return data;
}

async function fetchFromSheet(sheet, attempt = 1) {
  const url = getWebhookUrl();
  const sep = url.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${url}${sep}sheet=${sheet}&key=${encodeURIComponent(getApiKey())}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (e) {
    if (attempt >= SYNC_RETRIES) throw e;
    await sleep(SYNC_RETRY_DELAY_MS * attempt);
    return fetchFromSheet(sheet, attempt + 1);
  }
}

const api = {
  pushProduct: (item) => postToSheet({ type: "master", ...item }),
  tagAssign: (p) => postToSheet({ type: "tagassign", ...p }),
  staffAdd: (p) => postToSheet({ type: "staffadd", ...p }),
  auditBatch: (entries) => postToSheet({ type: "auditbatch", entries }),
  consolBoxClose: (p) => postToSheet({ type: "consolboxclose", ...p }),
  consolUpdate: (p) => postToSheet({ type: "consolupdate", ...p }),
  consolCountUpdate: (p) => postToSheet({ type: "consolcountupdate", ...p }),
  consolLogResolve: (p) => postToSheet({ type: "consollogresolve", ...p }),
  receivingImport: (item) => postToSheet({ type: "receivingimport", ...item }),
  receivingImportBatch: (items) => postToSheet({ type: "receivingimportbatch", items }),
  receivingStatus: (p) => postToSheet({ type: "receivingstatus", ...p }),
  checkFloorUpdate: (p) => postToSheet({ type: "checkfloorupdate", ...p }),
  floorPickUpdate: (p) => postToSheet({ type: "floorpickupdate", ...p }),
  floor86Restock: (p) => postToSheet({ type: "floor86restock", ...p }),
  floorRestockAdd: (p) => postToSheet({ type: "floorrestockadd", ...p }),
  feedback: (p) => postToSheet({ type: "feedback", ...p }),
};
