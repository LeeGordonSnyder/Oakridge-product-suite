/* ============================================================================
   Oakridge Product Suite — Daily Deployment (Deployment.gs)

   Builds the day's color-coded deployment grid in the shared Google Sheet
   from each person's When I Work calendar feed, and serves each person's
   own shift to the app.

   Add this as a NEW file in the existing Apps Script project (Files → + →
   Script → "Deployment"), then add ONE line to computeDoGetResult() in
   Code.gs — see backend/README.md. Nothing else in Code.gs changes, so the
   original app keeps working exactly as before.

   Tabs it uses (created by Deployment → Set up deployment tabs):
     Staff Calendars   — Initials | Name | When I Work calendar link | Last sync | Status
     Deployment Codes  — Code | Meaning | Fill | Text | When I Work positions
     Deployment        — today's grid (rebuilt each morning, editable by hand)
     Deployment YYYY-MM-DD — previous days, kept for DEPLOY.ARCHIVE_KEEP days

   The grid is the source of truth once it's built: leads can retype any
   cell (FL, PG, PROD, B …) and the colors update by themselves; the app
   reads whatever the grid says at that moment.
   ========================================================================= */

const DEPLOY = {
  TZ: "America/Vancouver",
  SHEET: "Deployment",
  CAL_SHEET: "Staff Calendars",
  CODES_SHEET: "Deployment Codes",
  ARCHIVE_PREFIX: "Deployment ",
  ARCHIVE_KEEP: 14,
  OPERATING_HOURS: "10am – 9pm",
  // Grid: 15-minute slots from 8:00am to 10:00pm
  GRID_START_MIN: 8 * 60,
  GRID_END_MIN: 22 * 60,
  SLOT_MIN: 15,
  HEADER_ROW: 3,
  FIRST_STAFF_ROW: 4,
  MIN_STAFF_ROWS: 16, // blank rows kept for people added by hand
  COL: { NAME: 1, SHIFT: 2, BREAK30: 3, BREAK15A: 4, BREAK15B: 5, GRID: 6 },
  FEED_CACHE_SECONDS: 1800,
  AUTO_BUILD_HOUR: 5,
  // Break policy — same rules as the WiW → deployment workbook tool:
  //   ≤ 5h: none · 5–6h: one 15 · 6–8.5h: 15 + 30 · ≥ 8.5h: 15 + 30 + 15
  BREAKS: {
    NO_BREAK_MAX_HOURS: 5.0,
    ONE_FIFTEEN_MAX_HOURS: 6.0,
    FIFTEEN_AND_THIRTY_MAX_HOURS: 8.5,
    EDGE_BUFFER_MIN: 30, // no breaks in the first/last 30 min of a shift
    STEP_MIN: 15, // breaks land on the 15-minute grid
    MIN_ON_FLOOR: 2, // never fewer than 2 people working
    MIN_FLOOR_LEADS: 1, // never zero Floor Leads while one is scheduled
  },
  BREAK_CODE: "B",
};

// Code, meaning, fill, text color, When I Work position names that map to it.
// Seeded into the "Deployment Codes" tab once; edit the tab, not this list.
const DEFAULT_DEPLOY_CODES = [
  ["FL", "Floor Leader", "#F4A93B", "#000000", "Floor Lead, Floor Leader, Key Holder"],
  ["PROD", "BOH / Product", "#1F6FC1", "#FFFFFF", "Product Operations, BOH, Back of House, Product"],
  ["PG", "Product Guide", "#2FAE4E", "#FFFFFF", "Product Guide, Sales Associate"],
  ["VM", "Visual Merchandising", "#C2185B", "#FFFFFF", "Visual Merchandising"],
  ["INIT", "Initiatives", "#8E7CC3", "#FFFFFF", "Initiatives"],
  ["PD", "Training / Development", "#7B4FA0", "#FFFFFF", "Training, Development"],
  ["MEET", "Leadership Meeting", "#5B2C6F", "#FFFFFF", "Meeting, Leadership Meeting"],
  ["HUD", "Huddle", "#00C8D6", "#000000", "Huddle"],
  ["OPEN", "Open", "#FFF200", "#000000", "Open"],
  ["CLOSE", "Close", "#FFF200", "#000000", "Close"],
  ["TRAIN-E", "Trainee", "#FF0090", "#FFFFFF", ""],
  ["TRAINER", "Trainer", "#F8BBD0", "#000000", ""],
  ["B", "Break", "#D9D9D9", "#C0392B", ""],
];

/* ===================== time helpers (Apps Script or Node) ===================== */

function deployLocalParts_(date) {
  if (typeof Utilities !== "undefined") {
    const s = Utilities.formatDate(date, DEPLOY.TZ, "yyyy-MM-dd HH mm");
    const [day, h, m] = s.split(" ");
    return { day, minutes: Number(h) * 60 + Number(m) };
  }
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: DEPLOY.TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

function deployTodayKey_() {
  return deployLocalParts_(new Date()).day;
}

// 510 -> "8:30a", 1320 -> "10p"
function deployFmtTime_(min) {
  const h24 = Math.floor(min / 60), m = min % 60;
  const h = ((h24 + 11) % 12) + 1;
  return `${h}${m ? ":" + String(m).padStart(2, "0") : ""}${h24 < 12 ? "a" : "p"}`;
}

function deployDayLabel_(dayKey) {
  const [y, mo, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, 12));
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[dt.getUTCDay()]}, ${months[mo - 1]} ${d}`;
}

/* ===================== When I Work feed → shifts ===================== */

// Minimal iCalendar parser: VEVENTs with DTSTART/DTEND/SUMMARY.
function deployParseIcs_(text) {
  const unfolded = String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const events = [];
  for (const chunk of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = chunk.split("END:VEVENT")[0];
    const f = {};
    for (const line of body.split("\n")) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const key = line.slice(0, i), name = key.split(";")[0];
      if (!(name in f)) f[name] = { key, value: line.slice(i + 1).trim() };
    }
    const start = deployIcsDate_(f.DTSTART), end = deployIcsDate_(f.DTEND);
    if (!start || !end) continue;
    const summary = f.SUMMARY ? f.SUMMARY.value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ") : "";
    events.push({ start, end, summary });
  }
  return events;
}

function deployIcsDate_(field) {
  if (!field) return null;
  const m = field.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  // Floating/TZID times: When I Work sends UTC ("Z"); treat anything else as store time.
  const guess = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  const offsetMin = deployLocalParts_(guess).minutes - (+h * 60 + +mi);
  return new Date(guess.getTime() - (((offsetMin + 720) % 1440) - 720) * 60000);
}

// "Shift as Product Guide at Arc'teryx Oakridge" -> "Product Guide"
function deployPositionFromSummary_(summary) {
  const m = String(summary).match(/^Shift as (.+?) at /i);
  return (m ? m[1] : String(summary)).trim();
}

function deployCodeForPosition_(position, codes) {
  const p = position.toLowerCase();
  for (const c of codes) if (c.positions.some((x) => x === p)) return c.code;
  for (const c of codes) if (c.positions.some((x) => x && p.includes(x))) return c.code;
  return position.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 5) || "?";
}

// All of one person's role blocks on one day, merged where the same role
// continues, clipped to the grid hours.
function deployBlocksForDay_(events, dayKey, codes) {
  const blocks = [];
  for (const ev of events) {
    const s = deployLocalParts_(ev.start), e = deployLocalParts_(ev.end);
    if (s.day !== dayKey) continue;
    const startMin = s.minutes;
    const endMin = e.day === dayKey ? e.minutes : 24 * 60;
    const a = Math.max(startMin, DEPLOY.GRID_START_MIN), b = Math.min(endMin, DEPLOY.GRID_END_MIN);
    if (b <= a) continue;
    blocks.push({ code: deployCodeForPosition_(deployPositionFromSummary_(ev.summary), codes), start: a, end: b });
  }
  blocks.sort((x, y) => x.start - y.start);
  const merged = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && last.code === b.code && last.end === b.start) last.end = b.end;
    else merged.push({ ...b });
  }
  return merged;
}

/* ===================== breaks ===================== */

function deployRequiredBreaks_(hours) {
  const B = DEPLOY.BREAKS;
  if (hours <= B.NO_BREAK_MAX_HOURS) return [];
  if (hours < B.ONE_FIFTEEN_MAX_HOURS) return [15];
  if (hours < B.FIFTEEN_AND_THIRTY_MAX_HOURS) return [15, 30];
  return [15, 30, 15];
}

// Places every person's breaks, spaced evenly through their shift, while
// keeping at least MIN_ON_FLOOR people and (when one's scheduled) a Floor
// Lead on the floor. If no slot satisfies the rules, the break is placed
// as close to ideal as possible and flagged for a lead to look at.
// roster: [{ name, start, end, blocks }] — adds roster[i].breaks = [{start, duration, flagged}]
function deployScheduleBreaks_(roster) {
  const B = DEPLOY.BREAKS;
  const onBreak = {}; // minute -> Set(name)
  const roleAt = (p, m) => { for (const b of p.blocks) if (b.start <= m && m < b.end) return b.code; return null; };
  const working = (p, m) => roleAt(p, m) !== null;

  const valid = (p, start, dur, placed) => {
    const end = start + dur;
    if (start < p.start || end > p.end) return false;
    for (const b of placed) if (start < b.start + b.duration + 30 && b.start < end + 30) return false; // own breaks ≥30 min apart
    for (let m = start; m < end; m += 5) {
      const away = new Set(onBreak[m] || []);
      away.add(p.name);
      const scheduled = roster.filter((q) => working(q, m));
      const onFloor = scheduled.filter((q) => !away.has(q.name));
      if (onFloor.length < B.MIN_ON_FLOOR && scheduled.length > onFloor.length) return false;
      const fls = scheduled.filter((q) => roleAt(q, m) === "FL");
      if (fls.length && onFloor.filter((q) => roleAt(q, m) === "FL").length < Math.min(B.MIN_FLOOR_LEADS, fls.length)) return false;
    }
    return true;
  };
  const snap = (m) => Math.round(m / B.STEP_MIN) * B.STEP_MIN;

  const order = roster.slice().sort((a, b) =>
    deployRequiredBreaks_((b.end - b.start) / 60).reduce((x, y) => x + y, 0) - deployRequiredBreaks_((a.end - a.start) / 60).reduce((x, y) => x + y, 0) || a.start - b.start);
  for (const p of order) {
    const durs = deployRequiredBreaks_((p.end - p.start) / 60);
    p.breaks = [];
    if (!durs.length) continue;
    let ws = p.start + B.EDGE_BUFFER_MIN, we = p.end - B.EDGE_BUFFER_MIN;
    if (we <= ws) { ws = p.start; we = p.end; }
    const placed = [];
    durs.forEach((dur, i) => {
      const center = ws + ((we - ws) * (i + 1)) / (durs.length + 1);
      const target = Math.max(ws, Math.min(snap(center - dur / 2), we - dur));
      let found = null;
      for (let r = 0; r <= we - ws && found === null; r += B.STEP_MIN) {
        for (const c of r === 0 ? [target] : [target + r, target - r]) {
          if (c < ws || c + dur > we) continue;
          if (valid(p, c, dur, placed)) { found = c; break; }
        }
      }
      placed.push({ start: found === null ? target : found, duration: dur, flagged: found === null });
    });
    p.breaks = placed.sort((a, b) => a.start - b.start);
    for (const b of p.breaks) for (let m = b.start; m < b.start + b.duration; m += 5) (onBreak[m] = onBreak[m] || new Set()).add(p.name);
  }
  return roster;
}

/* ===================== grid row <-> blocks ===================== */

function deploySlotCount_() {
  return (DEPLOY.GRID_END_MIN - DEPLOY.GRID_START_MIN) / DEPLOY.SLOT_MIN;
}

// One person's row of slot codes (role blocks with breaks laid over them).
function deploySlotsFor_(person) {
  const n = deploySlotCount_(), slots = new Array(n).fill("");
  const put = (start, end, code) => {
    for (let m = start; m < end; m += DEPLOY.SLOT_MIN) {
      const i = (m - DEPLOY.GRID_START_MIN) / DEPLOY.SLOT_MIN;
      if (i >= 0 && i < n) slots[Math.floor(i)] = code;
    }
  };
  for (const b of person.blocks) put(b.start, b.end, b.code);
  for (const b of person.breaks || []) put(b.start, b.start + b.duration, DEPLOY.BREAK_CODE);
  return slots;
}

// A grid row (as typed in the sheet) back into blocks — this is what the app sees.
function deployBlocksFromSlots_(slots) {
  const blocks = [];
  slots.forEach((raw, i) => {
    const code = String(raw || "").trim().toUpperCase();
    const start = DEPLOY.GRID_START_MIN + i * DEPLOY.SLOT_MIN;
    const last = blocks[blocks.length - 1];
    if (!code) return;
    if (last && last.code === code && last.end === start) last.end = start + DEPLOY.SLOT_MIN;
    else blocks.push({ code, start, end: start + DEPLOY.SLOT_MIN });
  });
  return blocks;
}

/* ===================== building the day (pure) ===================== */

// people: [{ initials, name, ics }] -> roster sorted by start time, with breaks
function deployBuildRoster_(people, dayKey, codes) {
  const roster = [];
  for (const p of people) {
    if (!p.ics) continue;
    const blocks = deployBlocksForDay_(deployParseIcs_(p.ics), dayKey, codes);
    if (!blocks.length) continue;
    roster.push({ initials: p.initials, name: p.name || p.initials, blocks, start: blocks[0].start, end: blocks[blocks.length - 1].end });
  }
  roster.sort((a, b) => a.start - b.start || a.end - b.end || a.name.localeCompare(b.name));
  return deployScheduleBreaks_(roster);
}

/* ===================== Google Sheets side ===================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Deployment")
    .addItem("Build today's deployment", "deployMenuBuildToday")
    .addItem("Build for another date…", "deployMenuBuildDate")
    .addSeparator()
    .addItem("Set up deployment tabs", "deploySetup")
    .addItem("Turn on daily auto-build", "deployInstallTrigger")
    .addItem("Turn off daily auto-build", "deployRemoveTrigger")
    .addToUi();
}

function deploySetup() {
  const ss = SpreadsheetApp.getActive();
  let cal = ss.getSheetByName(DEPLOY.CAL_SHEET);
  if (!cal) {
    cal = ss.insertSheet(DEPLOY.CAL_SHEET);
    cal.getRange(1, 1, 1, 5).setValues([["Initials", "Name (as shown on the deployment)", "When I Work calendar link (webcal://…)", "Last sync", "Status"]])
      .setFontWeight("bold").setBackground("#894554").setFontColor("#ffffff");
    cal.setFrozenRows(1);
    cal.setColumnWidths(1, 1, 80); cal.setColumnWidth(2, 220); cal.setColumnWidth(3, 520); cal.setColumnWidth(4, 150); cal.setColumnWidth(5, 280);
    cal.getRange("A2").setNote("One row per person. Get the link in When I Work: Schedule → Sync to Calendar (or Subscribe). Anyone with a link can see that person's schedule — keep this tab to leads.");
  }
  let codes = ss.getSheetByName(DEPLOY.CODES_SHEET);
  if (!codes) {
    codes = ss.insertSheet(DEPLOY.CODES_SHEET);
    codes.getRange(1, 1, 1, 5).setValues([["Code", "Meaning", "Fill color", "Text color", "When I Work positions (comma-separated)"]])
      .setFontWeight("bold").setBackground("#894554").setFontColor("#ffffff");
    codes.getRange(2, 1, DEFAULT_DEPLOY_CODES.length, 5).setValues(DEFAULT_DEPLOY_CODES);
    DEFAULT_DEPLOY_CODES.forEach((c, i) => codes.getRange(i + 2, 1).setBackground(c[2]).setFontColor(c[3]).setFontWeight("bold"));
    codes.setFrozenRows(1);
    codes.setColumnWidth(2, 200); codes.setColumnWidth(5, 380);
  }
  SpreadsheetApp.getActive().toast("Deployment tabs are ready. Add everyone's When I Work link to “Staff Calendars”, then Deployment → Build today's deployment.");
}

function deployReadCodes_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DEPLOY.CODES_SHEET);
  const rows = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 5).getDisplayValues() : DEFAULT_DEPLOY_CODES;
  return rows
    .filter((r) => String(r[0]).trim())
    .map((r) => ({
      code: String(r[0]).trim().toUpperCase(), label: String(r[1]).trim(),
      bg: String(r[2]).trim() || "#ffffff", fg: String(r[3]).trim() || "#000000",
      positions: String(r[4]).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
    }));
}

function deployReadStaff_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DEPLOY.CAL_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues()
    .map((r, i) => ({ row: i + 2, initials: String(r[0]).trim().toUpperCase(), name: String(r[1]).trim(), url: String(r[2]).trim() }))
    .filter((p) => p.initials || p.name);
}

function deployFetchFeed_(url) {
  const https = url.replace(/^webcal:\/\//i, "https://");
  const cache = CacheService.getScriptCache();
  const key = "wiw:" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, https));
  const hit = cache.get(key);
  if (hit) return hit;
  const res = UrlFetchApp.fetch(https, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error("When I Work answered " + res.getResponseCode());
  const text = res.getContentText();
  if (text.indexOf("BEGIN:VCALENDAR") < 0) throw new Error("That link didn't return a calendar");
  try { cache.put(key, text, DEPLOY.FEED_CACHE_SECONDS); } catch (e) { /* >100KB: skip cache */ }
  return text;
}

// Pulls every feed, builds the roster and (re)writes the Deployment tab.
function deployBuild(dayKey) {
  dayKey = dayKey || deployTodayKey_();
  const ss = SpreadsheetApp.getActive();
  const codes = deployReadCodes_();
  const staff = deployReadStaff_();
  const cal = ss.getSheetByName(DEPLOY.CAL_SHEET);
  const stamp = Utilities.formatDate(new Date(), DEPLOY.TZ, "MMM d, h:mm a");
  const people = [];
  for (const p of staff) {
    let status;
    if (!p.url) status = "No link yet";
    else {
      try {
        const ics = deployFetchFeed_(p.url);
        people.push({ ...p, ics });
        const n = deployBlocksForDay_(deployParseIcs_(ics), dayKey, codes).length;
        status = n ? `OK — on the ${deployDayLabel_(dayKey)} deployment` : `OK — not scheduled ${deployDayLabel_(dayKey)}`;
      } catch (e) {
        status = "Couldn't read feed: " + e.message;
      }
    }
    if (cal) cal.getRange(p.row, 4, 1, 2).setValues([[stamp, status]]);
  }
  const roster = deployBuildRoster_(people, dayKey, codes);
  deployWriteSheet_(dayKey, roster, codes);
  return roster;
}

function deployArchiveCurrent_(ss) {
  const cur = ss.getSheetByName(DEPLOY.SHEET);
  if (!cur) return;
  const oldKey = cur.getRange("B1").getNote();
  if (oldKey) {
    const name = DEPLOY.ARCHIVE_PREFIX + oldKey;
    const existing = ss.getSheetByName(name);
    if (existing) ss.deleteSheet(existing);
    cur.setName(name);
  } else {
    ss.deleteSheet(cur);
  }
  // keep the newest ARCHIVE_KEEP archives
  const archives = ss.getSheets().map((s) => s.getName()).filter((n) => /^Deployment \d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
  archives.slice(DEPLOY.ARCHIVE_KEEP).forEach((n) => ss.deleteSheet(ss.getSheetByName(n)));
}

function deployWriteSheet_(dayKey, roster, codes) {
  const ss = SpreadsheetApp.getActive();
  const cur = ss.getSheetByName(DEPLOY.SHEET);
  if (cur && cur.getRange("B1").getNote() === dayKey) ss.deleteSheet(cur); // rebuilding the same day
  else deployArchiveCurrent_(ss);
  const sh = ss.insertSheet(DEPLOY.SHEET, 0);
  const C = DEPLOY.COL, n = deploySlotCount_();
  const lastGridCol = C.GRID + n - 1;
  const rows = Math.max(DEPLOY.MIN_STAFF_ROWS, roster.length + 4);
  const maroon = "#894554";

  // Header block
  sh.getRange(1, 1, 2, lastGridCol).setFontFamily("Arial");
  sh.getRange("A1").setValue("DATE").setBackground(maroon).setFontColor("#fff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange("B1").setValue(deployDayLabel_(dayKey)).setFontWeight("bold").setNote(dayKey);
  sh.getRange("A2").setValue("Operating hours").setBackground(maroon).setFontColor("#fff").setFontSize(8).setHorizontalAlignment("center");
  sh.getRange("B2").setValue(DEPLOY.OPERATING_HOURS);
  sh.getRange(1, C.BREAK30, 2, 3).merge().setValue("Built from When I Work " + Utilities.formatDate(new Date(), DEPLOY.TZ, "h:mm a") + "\nEdit any cell — colors follow the code")
    .setFontSize(8).setFontColor("#7c6469").setWrap(true).setVerticalAlignment("middle");

  // Column headers: TEAM | SHIFT | BREAK | 15 MIN | 15 MIN | 8am … 9pm (4 slots per hour)
  sh.getRange(DEPLOY.HEADER_ROW, 1, 1, 5).setValues([["TEAM", "SHIFT", "BREAK", "15 MIN", "15 MIN"]]);
  for (let h = DEPLOY.GRID_START_MIN; h < DEPLOY.GRID_END_MIN; h += 60) {
    const col = C.GRID + (h - DEPLOY.GRID_START_MIN) / DEPLOY.SLOT_MIN;
    sh.getRange(DEPLOY.HEADER_ROW, col, 1, 60 / DEPLOY.SLOT_MIN).merge().setValue(deployFmtTime_(h).replace("a", "am").replace("p", "pm"));
  }
  sh.getRange(DEPLOY.HEADER_ROW, 1, 1, lastGridCol).setBackground(maroon).setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center").setFontSize(9);

  // Staff rows
  const values = [];
  for (let i = 0; i < rows; i++) {
    const p = roster[i];
    if (!p) { values.push(new Array(lastGridCol).fill("")); continue; }
    const b30 = p.breaks.find((b) => b.duration === 30);
    const b15 = p.breaks.filter((b) => b.duration === 15);
    values.push([p.name, `${deployFmtTime_(p.start)}-${deployFmtTime_(p.end)}`,
      b30 ? deployFmtTime_(b30.start) : "", b15[0] ? deployFmtTime_(b15[0].start) : "", b15[1] ? deployFmtTime_(b15[1].start) : "",
      ...deploySlotsFor_(p)]);
  }
  const body = sh.getRange(DEPLOY.FIRST_STAFF_ROW, 1, rows, lastGridCol);
  body.setNumberFormat("@").setValues(values).setFontFamily("Arial").setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true, "#d9c7cc", SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(DEPLOY.FIRST_STAFF_ROW, 1, rows, 2).setFontWeight("bold").setFontSize(10);
  sh.getRange(DEPLOY.FIRST_STAFF_ROW, C.BREAK30, rows, 3).setFontColor("#C0392B").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange(DEPLOY.FIRST_STAFF_ROW, C.GRID, rows, n).setFontSize(7).setFontWeight("bold").setHorizontalAlignment("center");
  // flag breaks the scheduler couldn't place within the coverage rules
  roster.forEach((p, i) => p.breaks.forEach((b) => {
    if (!b.flagged) return;
    const col = b.duration === 30 ? C.BREAK30 : C.BREAK15A + p.breaks.filter((x) => x.duration === 15).indexOf(b);
    sh.getRange(DEPLOY.FIRST_STAFF_ROW + i, col).setBackground("#ffe1e1").setNote("Couldn't keep 2 people / a Floor Lead on the floor for this break — please check it.");
  }));
  // hour dividers
  for (let h = DEPLOY.GRID_START_MIN; h < DEPLOY.GRID_END_MIN; h += 60) {
    const col = C.GRID + (h - DEPLOY.GRID_START_MIN) / DEPLOY.SLOT_MIN;
    sh.getRange(DEPLOY.HEADER_ROW, col, rows + 1, 1).setBorder(null, true, null, null, null, null, "#894554", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }

  // Colors come from conditional formatting, so typing a code recolors the cell.
  const grid = sh.getRange(DEPLOY.FIRST_STAFF_ROW, C.GRID, rows, n);
  sh.setConditionalFormatRules(codes.map((c) =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(c.code).setBackground(c.bg).setFontColor(c.fg).setRanges([grid]).build()));

  // Legend
  const lc = lastGridCol + 2;
  sh.getRange(DEPLOY.HEADER_ROW, lc, 1, 2).setValues([["Code", "Shift functions"]]).setBackground(maroon).setFontColor("#fff").setFontWeight("bold");
  codes.forEach((c, i) => {
    sh.getRange(DEPLOY.HEADER_ROW + 1 + i, lc).setValue(c.code).setBackground(c.bg).setFontColor(c.fg).setFontWeight("bold").setHorizontalAlignment("center");
    sh.getRange(DEPLOY.HEADER_ROW + 1 + i, lc + 1).setValue(c.label);
  });

  // Sizing
  sh.setColumnWidth(1, 110); sh.setColumnWidth(2, 100);
  sh.setColumnWidths(C.BREAK30, 3, 58);
  sh.setColumnWidths(C.GRID, n, 26);
  sh.setColumnWidth(lc, 70); sh.setColumnWidth(lc + 1, 170);
  sh.setRowHeights(DEPLOY.FIRST_STAFF_ROW, rows, 22);
  sh.setFrozenRows(DEPLOY.HEADER_ROW);
  sh.setFrozenColumns(2);
  ss.setActiveSheet(sh);
}

function deployMenuBuildToday() {
  const ui = SpreadsheetApp.getUi();
  const cur = SpreadsheetApp.getActive().getSheetByName(DEPLOY.SHEET);
  if (cur && cur.getRange("B1").getNote() === deployTodayKey_()) {
    const r = ui.alert("Rebuild today's deployment?", "Today's tab already exists. Rebuilding pulls fresh shifts from When I Work and replaces any changes made to it today.", ui.ButtonSet.OK_CANCEL);
    if (r !== ui.Button.OK) return;
  }
  const roster = deployBuild();
  SpreadsheetApp.getActive().toast(`Built today's deployment — ${roster.length} people scheduled.`);
}

function deployMenuBuildDate() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Build deployment for a date", "Date as YYYY-MM-DD (e.g. 2026-10-16):", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const key = r.getResponseText().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { ui.alert("Please use the format YYYY-MM-DD."); return; }
  const roster = deployBuild(key);
  SpreadsheetApp.getActive().toast(`Built ${deployDayLabel_(key)} — ${roster.length} people scheduled.`);
}

// Time-driven: builds today's tab once, early morning. Never overwrites a
// day that's already been built (so edits made on the day are safe).
function deployDailyTrigger() {
  const cur = SpreadsheetApp.getActive().getSheetByName(DEPLOY.SHEET);
  if (cur && cur.getRange("B1").getNote() === deployTodayKey_()) return;
  deployBuild();
}

function deployInstallTrigger() {
  deployRemoveTrigger(true);
  ScriptApp.newTrigger("deployDailyTrigger").timeBased().everyDays(1).atHour(DEPLOY.AUTO_BUILD_HOUR).inTimezone(DEPLOY.TZ).create();
  SpreadsheetApp.getActive().toast(`Daily auto-build is on — around ${DEPLOY.AUTO_BUILD_HOUR}am every day.`);
}

function deployRemoveTrigger(quiet) {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "deployDailyTrigger").forEach((t) => ScriptApp.deleteTrigger(t));
  if (quiet !== true) SpreadsheetApp.getActive().toast("Daily auto-build is off.");
}

/* ===================== served to the app ===================== */

// GET ?sheet=deployment — today's grid as it currently stands (including any
// hand edits), one entry per person. Feed links are never sent.
function getDeploymentForApp() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(DEPLOY.SHEET);
  const codes = deployReadCodes_().map(({ code, label, bg, fg }) => ({ code, label, bg, fg }));
  if (!sh) return { ok: true, deployment: null, codes };
  const dayKey = sh.getRange("B1").getNote();
  const n = deploySlotCount_();
  const last = sh.getLastRow();
  const people = [];
  if (last >= DEPLOY.FIRST_STAFF_ROW) {
    const staff = deployReadStaff_();
    const byName = {};
    staff.forEach((s) => { if (s.name) byName[s.name.toLowerCase()] = s.initials; if (s.initials) byName[s.initials.toLowerCase()] = s.initials; });
    const rows = sh.getRange(DEPLOY.FIRST_STAFF_ROW, 1, last - DEPLOY.FIRST_STAFF_ROW + 1, DEPLOY.COL.GRID + n - 1).getDisplayValues();
    for (const r of rows) {
      const name = String(r[0]).trim();
      if (!name) continue;
      const blocks = deployBlocksFromSlots_(r.slice(DEPLOY.COL.GRID - 1));
      people.push({
        name, initials: byName[name.toLowerCase()] || "", shift: String(r[1]).trim(),
        breaks: [r[2], r[3], r[4]].map((x) => String(x).trim()).filter(Boolean),
        start: blocks.length ? blocks[0].start : null, end: blocks.length ? blocks[blocks.length - 1].end : null, blocks,
      });
    }
  }
  return { ok: true, deployment: { date: dayKey, label: dayKey ? deployDayLabel_(dayKey) : "", slotMinutes: DEPLOY.SLOT_MIN, people }, codes };
}

// Node test harness hook (ignored by Apps Script)
if (typeof module !== "undefined") {
  module.exports = { DEPLOY, DEFAULT_DEPLOY_CODES, deployParseIcs_, deployBlocksForDay_, deployBuildRoster_, deployScheduleBreaks_, deploySlotsFor_, deployBlocksFromSlots_, deployFmtTime_, deployDayLabel_, deployRequiredBreaks_, deployLocalParts_ };
}
