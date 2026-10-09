// Captures step-by-step screenshots of the rebuild for the PDF guides,
// against a mocked backend with realistic sample data (the real sheet is
// never touched). Serve the repo root on :8765 first:
//   python3 -m http.server 8765
//   node tools/guides/shots.js        -> tools/guides/shots/*.png
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8765/';

const ago = (n) => new Date(Date.now() - n * 864e5).toISOString();
const day = (n) => ago(n).slice(0, 10);
const P = (sku, upc, style, color, size, desc, tag = '') => ({ SKU: sku, UPC: upc, DEPT: desc.includes("Women") ? 'W' : 'M', 'STYLE SKU': style, COLOR: color, SIZE: size, DESCRIPTION: desc, 'HARD TAG LOCATION': tag });
const DATA = {
  staff: ['LS', 'SC', 'SG', 'JV'],
  master: [
    P('X000009560002', '623555583288', 'X000009560', 'Black', 'S', "Atom SL Hoody Men's", 'Chest Pocket'),
    P('X000009560003', '623555583295', 'X000009560', 'Black', 'M', "Atom SL Hoody Men's", 'Chest Pocket'),
    P('X000009560004', '623555583301', 'X000009560', 'Black', 'L', "Atom SL Hoody Men's", 'Chest Pocket'),
    P('X000009560012', '623555583318', 'X000009560', 'Void', 'M', "Atom SL Hoody Men's", 'Chest Pocket'),
    P('X000007300001', '686487612345', 'X000007300', 'Solace', 'S', "Beta Jacket Women's", 'Hood'),
    P('X000007300002', '686487612352', 'X000007300', 'Solace', 'M', "Beta Jacket Women's", 'Hood'),
    P('X000006700003', '686487698712', 'X000006700', 'Black', '32', "Gamma Pant Men's", 'Left Leg In-seam'),
    P('X000005100001', '686487655501', 'X000005100', 'Graphite', 'M', "Cerium Hoody Men's", ''),
  ],
  auditlog: [
    { id: 'a1', timestamp: ago(1), date: day(1), initials: 'SC', sku: 'X000007300002', upc: '686487612352', style: 'X000007300', description: "Beta Jacket Women's — Solace / M", expected: 12, counted: 7, variance: -5, result: 'under' },
    { id: 'a2', timestamp: ago(1), date: day(1), initials: 'SC', sku: 'X000009560003', upc: '623555583295', style: 'X000009560', description: "Atom SL Hoody Men's — Black / M", expected: 6, counted: 6, variance: 0, result: 'match' },
    { id: 'a3', timestamp: ago(2), date: day(2), initials: 'JV', sku: 'X000006700003', upc: '686487698712', style: 'X000006700', description: "Gamma Pant Men's — Black / 32", expected: 4, counted: 5, variance: 1, result: 'over' },
  ],
  consolmaster: [
    { MATERIAL: "Gamma Pant Men's", COLOR: 'Black', 'STYLE SKU': 'X000006700', 'ECC GENERIC MATERIAL': '30451', DESTINATION: 'Toronto DC', TOTAL: 4, PROCESSED: '' },
    { MATERIAL: "Cerium Hoody Men's", COLOR: 'Graphite', 'STYLE SKU': 'X000005100', 'ECC GENERIC MATERIAL': '30452', DESTINATION: 'Toronto DC', TOTAL: 2, PROCESSED: '' },
    { MATERIAL: "Atom SL Hoody Men's", COLOR: 'Void', 'STYLE SKU': 'X000009560', 'ECC GENERIC MATERIAL': '30453', DESTINATION: 'Toronto DC', TOTAL: 3, PROCESSED: '' },
    { MATERIAL: "Beta Jacket Women's", COLOR: 'Solace', 'STYLE SKU': 'X000007300', 'ECC GENERIC MATERIAL': '30450', DESTINATION: 'Toronto DC', TOTAL: 2, PROCESSED: 'Processed' },
  ],
  consollog: [
    { id: 'c1', entryType: 'packout', timestamp: ago(1), date: day(1), initials: 'SG', referenceNumber: '4410093821' },
    { id: 'c2', entryType: 'status', timestamp: ago(1), date: day(1), initials: 'SG', eccMaterial: '30450', description: "Beta Jacket Women's", color: 'Solace', status: 'Actioned' },
    { id: 'count-30451', entryType: 'count', timestamp: ago(0), date: day(0), initials: 'SG', eccMaterial: '30451', description: "Gamma Pant Men's", color: 'Black', actualCount: 2 },
  ],
  receiving: [
    { barcode: '8069559026403610', po: '6390185302', expectedDate: day(4), physicallyReceivedDate: day(3), physicallyReceivedBy: 'SC', receivedIntoMaoDate: '', receivedIntoMaoBy: '' },
    { barcode: '8069559026403611', po: '6390185303', expectedDate: day(0), physicallyReceivedDate: '', physicallyReceivedBy: '', receivedIntoMaoDate: '', receivedIntoMaoBy: '' },
    { barcode: '8069559026403612', po: '6390185303', expectedDate: day(0), physicallyReceivedDate: '', physicallyReceivedBy: '', receivedIntoMaoDate: '', receivedIntoMaoBy: '' },
    { barcode: '8069559026403599', po: '6390185290', expectedDate: day(6), physicallyReceivedDate: day(5), physicallyReceivedBy: 'LS', receivedIntoMaoDate: day(5), receivedIntoMaoBy: 'LS' },
  ],
  floorrestock: (() => {
    const r = (name, color, size, sku, sold, onHand, extra = {}) => ({ GENDER: 'M', 'CLOTHING CATEGORY': 'Jackets', 'MODEL NAME': name, COLOR: color, SIZE: size, SKU: sku, 'QUANTITY SOLD': sold, 'ON HAND QUANTITY': onHand, STATUS: '', 'CHECKED BY': '', 'CHECKED DATE': '', '86': '', RESTOCKED: '', ...extra });
    return [
      r("Atom Hoody Men's", 'Black', 'S', 'X000009560002', 1, 3), r("Atom Hoody Men's", 'Black', 'M', 'X000009560003', 2, 4), r("Atom Hoody Men's", 'Black', 'L', 'X000009560004', 1, 2),
      r("Atom Hoody Men's", 'Void', 'M', 'X000009560012', 1, 1),
      r("Beta Jacket Women's", 'Solace', 'S', 'X000007300001', 1, 2),
      r("Cormac Tee Men's", 'White', 'L', 'X000004400004', 2, 6),
      r("Gamma Pant Men's", 'Black', '32', 'X000006700003', 1, 0, { STATUS: 'Needed', 'CHECKED BY': 'JV', 'CHECKED DATE': ago(4) }),
      r("Gamma Pant Men's", 'Black', '34', 'X000006700004', 0, 0, { STATUS: 'Needed', 'CHECKED BY': 'JV', 'CHECKED DATE': ago(4) }),
      r("Cerium Hoody Men's", 'Graphite', 'M', 'X000005100001', 1, 0, { STATUS: 'Needed', 'CHECKED BY': 'SC', 'CHECKED DATE': ago(0) }),
      r("Proton Hoody Women's", 'Black', 'XS', 'X000003300001', 1, 0, { STATUS: 'Out of Stock', 'CHECKED BY': 'SC', 'CHECKED DATE': ago(2), '86': ago(2) }),
      r("Squamish Hoody Men's", 'Tatsu', 'L', 'X000002200004', 1, 0, { STATUS: 'Out of Stock', 'CHECKED BY': 'LS', 'CHECKED DATE': ago(1), '86': ago(1) }),
    ];
  })(),
};

const MAO_PASTE = "Cerium Hoody Men's\nSKUX000005100002\nDeptM\nStyleX000005100\nColorGraphite\nSizeL\nUPC686487655518\nAvailable0 / 0\n\nCerium Hoody Men's\nSKUX000005100003\nDeptM\nStyleX000005100\nColorGraphite\nSizeXL\nUPC686487655525\nAvailable0 / 0";
const RECV_PASTE = "ETA:  10-10-2026\nPackage  8069559026403620\nOrigin  9120\nReceipt Type  Package\nFor  Store Inventory\nCarrier  UPS\nPO # 6390185311\nETA:  10-10-2026\nPackage  8069559026403621\nOrigin  9120\nReceipt Type  Package\nFor  Store Inventory\nCarrier  UPS\nPO # 6390185311";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.5 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('dialog', (d) => d.dismiss());
  let keyOk = true;
  await page.route('https://script.google.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    const u = new URL(req.url());
    if (!keyOk && u.searchParams.get('key') !== 'store-key') return route.fulfill({ contentType: 'application/json', body: '{"ok":false,"error":"Unauthorized"}' });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(DATA[u.searchParams.get('sheet')] ?? []) });
  });

  const shot = async (name, selector, opts = {}) => {
    await page.waitForTimeout(opts.wait ?? 250);
    const file = path.join(OUT, `${name}.png`);
    if (opts.clip) await page.screenshot({ path: file, clip: opts.clip });
    else if (!selector) await page.screenshot({ path: file });
    else {
      // Sticky header/nav would overlap element crops — hide them unless
      // they're what's being pictured.
      const bars = !/topbar|bottom-nav|update-banner/.test(selector);
      if (bars) await page.addStyleTag({ content: '.topbar,.bottom-nav,.toast{visibility:hidden!important}' }).then((h) => (page._barStyle = h));
      await page.locator(selector).first().screenshot({ path: file });
      if (bars) await page._barStyle.evaluate((el) => el.remove());
    }
    console.log('shot', name);
  };
  const hideToast = () => page.evaluate(() => (document.getElementById('toast').hidden = true));
  const go = async (route) => {
    await page.evaluate((r) => (location.hash = r), route);
    await page.waitForFunction((r) => !document.getElementById('view-' + r.split('/')[0]).hidden, route);
    await page.waitForTimeout(200);
  };
  const clearStatus = () => page.evaluate(() => document.querySelectorAll('.status-msg').forEach((e) => (e.textContent = '')));

  // ---------- Getting started ----------
  await page.goto(BASE + 'manifest.webmanifest');
  await page.evaluate(() => localStorage.clear());
  keyOk = false;
  await page.goto(BASE);
  await page.waitForSelector('#login-gate:not([hidden])');
  await page.waitForTimeout(400);
  await shot('start-01-signin', '#login-gate .modal-inner');
  await page.fill('#login-key', 'store-key');
  await page.selectOption('#login-select', 'LS');
  await shot('start-02-signin-filled', '#login-gate .modal-inner');
  await page.click('#login-continue');
  await page.waitForSelector('#app:not([hidden])');
  keyOk = true;
  await hideToast();
  // loading screen (re-shown for the picture)
  await page.evaluate(() => { document.getElementById('boot-loading').hidden = false; document.getElementById('boot-skip').hidden = false; });
  await shot('start-03-loading', null, { clip: { x: 0, y: 280, width: 390, height: 245 } });
  await page.evaluate(() => (document.getElementById('boot-loading').hidden = true));
  await go('home');
  await shot('start-04-header', '.topbar');
  await shot('start-05-nav', '.bottom-nav');
  await page.click('#settings-btn');
  await shot('start-06-settings', '#settings-modal .modal-inner');
  await page.click('#settings-feedback-btn');
  await page.fill('#feedback-text', 'Could the Replen list sort by department?');
  await shot('start-07-feedback', '#feedback-modal .modal-inner');
  await page.click('#feedback-modal [data-close]');
  await page.click('#change-user-btn');
  await shot('start-08-change-user', '#user-modal .modal-inner');
  await page.click('#user-modal [data-close]');
  await page.evaluate(() => (document.getElementById('update-banner').hidden = false));
  await shot('start-09-update', '#update-banner');
  await page.evaluate(() => (document.getElementById('update-banner').hidden = true));

  // ---------- Home ----------
  await go('home');
  await shot('home-01-overview');
  await shot('home-02-quick', '#view-home .quick-actions');
  await shot('home-03-exceptions', '#home-exceptions');
  await shot('home-04-kpis', '#home-kpis');

  // ---------- Catalog ----------
  await go('catalog');
  await shot('cat-01-empty');
  await page.fill('#catalog-search', 'atom');
  await shot('cat-02-results', '#view-catalog', {});
  await page.click('#catalog-results .result-row >> nth=1');
  await page.waitForSelector('#catalog-detail:not([hidden])');
  await shot('cat-03-detail', '#catalog-detail .product-card');
  await page.fill('#catalog-search', 'cerium');
  await page.click('#catalog-results .result-row');
  await page.selectOption('#catalog-tag-select', 'Hood');
  await shot('cat-04-tag', '#catalog-detail .tag-box');
  await page.click('[data-action="save-tag"]');
  await page.waitForTimeout(400);
  await hideToast();
  await page.click('[data-action="catalog-clear"]');
  await page.click('#view-catalog details.panel >> nth=0');
  await page.locator('#view-catalog details.panel >> nth=0').evaluate((d) => (d.open = true));
  await page.fill('#catalog-paste', MAO_PASTE);
  await shot('cat-05-import', '#view-catalog details.panel >> nth=0');
  await page.click('[data-action="catalog-import"]');
  await page.waitForFunction(() => /shared all/.test(document.getElementById('catalog-import-status').textContent));
  await shot('cat-06-imported', '#view-catalog details.panel >> nth=0');
  await page.locator('#view-catalog details.panel >> nth=0').evaluate((d) => (d.open = false));
  await page.locator('#view-catalog details.panel >> nth=1').evaluate((d) => (d.open = true));
  await shot('cat-07-tags', '#view-catalog details.panel >> nth=1');

  // ---------- Counts ----------
  await go('counts');
  await shot('cnt-01-top');
  await page.fill('#count-search', 'gamma');
  await shot('cnt-02-search', '#count-results');
  await page.click('#count-results .result-row');
  await page.fill('#count-expected', '4');
  await page.fill('#count-actual', '4');
  await shot('cnt-03-active', '#count-active-card');
  await page.click('[data-action="count-log"]');
  await shot('cnt-04-logged', '#count-status');
  await page.evaluate(() => handleCountScan('686487000999'));
  await page.fill('#count-add-sku', 'X000008800002');
  await page.fill('#count-add-description', "Kyanite Hoody Women's");
  await page.fill('#count-add-style', 'X000008800');
  await page.fill('#count-add-color', 'Black');
  await page.fill('#count-add-size', 'M');
  await shot('cnt-05-add', '#count-add-card');
  await page.click('[data-action="count-add-cancel"]');
  await clearStatus();
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#view-counts .section-head').offsetTop - 70));
  await shot('cnt-06-list', null);
  await page.click('[data-filter="flagged"]');
  await shot('cnt-07-flagged', '#count-list');
  await page.click('[data-filter="all"]');

  // ---------- Consolidations ----------
  await go('consol');
  await shot('con-01-close', '#view-consol .card');
  await page.fill('#consol-box-ref', '4410093877');
  await page.click('[data-action="consol-close-manual"]');
  await page.waitForSelector('#mao-reminder-modal:not([hidden])');
  await shot('con-02-mao', '#mao-reminder-modal .modal-inner');
  await page.click('#mao-reminder-confirm-btn');
  await page.waitForFunction(() => /closed and logged/.test(document.getElementById('consol-packout-status').textContent));
  await shot('con-03-closed', '#view-consol .card');
  await shot('con-04-items', '#consol-list');
  await page.click('[data-action="consol-inc"][data-ecc="30452"]');
  await page.click('[data-action="consol-inc"][data-ecc="30452"]');
  await page.waitForTimeout(300);
  await shot('con-05-stepper', '#consol-list');
  await page.click('[data-action="consol-stage"][data-ecc="30452"]');
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#consol-holding').offsetTop - 140));
  await shot('con-06-holding', null);
  await page.click('#consol-update-btn');
  await page.waitForFunction(() => /^Updated/.test(document.getElementById('consol-status').textContent));
  await shot('con-07-log', '#consol-log');

  // ---------- Receiving ----------
  await go('receiving');
  await shot('rec-01-top');
  await page.locator('#view-receiving details.panel').evaluate((d) => (d.open = true));
  await page.fill('#recv-paste', RECV_PASTE);
  await shot('rec-02-import', '#view-receiving details.panel');
  await page.click('[data-action="recv-import"]');
  await page.waitForFunction(() => /shared all/.test(document.getElementById('recv-import-status').textContent));
  await page.locator('#view-receiving details.panel').evaluate((d) => (d.open = false));
  // Scanner illustration (no camera in the capture browser)
  await page.evaluate(() => {
    holdBox('8069559026403611'); holdBox('8069559026403612');
    document.getElementById('scanner-modal').hidden = false;
    document.getElementById('scanner-modal-title').textContent = 'Scanning boxes…';
    document.getElementById('scanner-modal-cancel').textContent = 'Done Scanning';
    document.getElementById('scanner-modal-view').innerHTML = '<div style="height:230px;background:linear-gradient(160deg,#30262a,#4a3a40);display:grid;place-items:center"><div style="width:260px;height:130px;border:3px solid #fff;border-radius:6px;opacity:.85"></div></div>';
    setStatus('scanner-modal-feedback', 'Held 8069559026403612 (PO 6390185303). 2 boxes held.', false);
  });
  await shot('rec-03-scanner', '#scanner-modal .scanner-modal-inner');
  await page.evaluate(() => { document.getElementById('scanner-modal').hidden = true; document.getElementById('scanner-modal-view').innerHTML = ''; renderReceiving(); });
  await shot('rec-04-holding', '#recv-holding-section');
  await page.click('#recv-mark-physical-btn');
  await page.waitForFunction(() => /^Marked/.test(document.getElementById('recv-status').textContent));
  await clearStatus();
  await shot('rec-05-awaiting', '#recv-awaiting-section');
  await page.click('[data-action="recv-hold-awaiting"]');
  await clearStatus();
  await shot('rec-06-held-mao', '#recv-holding-section');
  await page.evaluate(() => openAddBoxModal('8069559026499999'));
  await page.fill('#recv-add-po', '6390185320');
  await shot('rec-07-notexpected', '#recv-add-modal .modal-inner');
  await page.click('#recv-add-modal [data-close]');
  await shot('rec-08-expected', '#recv-expected');

  // ---------- Floor Stock ----------
  await go('floor/check');
  await shot('flr-01-check');
  await shot('flr-02-lines', '#floor-check-list');
  const keyOf = (title, color) => page.$$eval('#floor-check-list .line-card', (els, [t, c]) => {
    const el = els.find((e) => e.querySelector('.line-title').textContent === t && e.querySelector('.line-sub').textContent.startsWith(c));
    return el.querySelector('[data-action="floor-needed"]').dataset.key;
  }, [title, color]);
  const blackKey = await keyOf("Atom Hoody Men's", 'Black');
  await page.click(`[data-action="floor-needed"][data-key="${blackKey}"]`);
  await page.click('#floor-needed-sizes label:has(input[value="M"])');
  await page.click('#floor-needed-sizes label:has(input[value="L"])');
  await shot('flr-03-sizes', '#floor-needed-modal .modal-inner');
  await page.click('#floor-needed-save-btn');
  await page.click(`[data-action="floor-not-needed"][data-key="${await keyOf("Cormac Tee Men's", 'White')}"]`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('flr-04-holding', '#floor-panel-check', {});
  await page.fill('#floor-search', 'kyanite fleece');
  await shot('flr-05-add', '#floor-panel-check .search-row', {});
  await page.click('#floor-manual-btn');
  await page.click('#floor-manual-sizes label:has(input[value="S"])');
  await shot('flr-06-manual', '#floor-manual-modal .modal-inner');
  await page.click('#floor-manual-modal [data-close]');
  await page.fill('#floor-search', '');
  await page.evaluate(() => renderFloorSearch());
  await page.click('#floor-check-update');
  await page.waitForFunction(() => /^Updated/.test(document.getElementById('floor-check-status').textContent));
  await go('floor/replen');
  await clearStatus();
  await shot('flr-07-replen', '#floor-replen-list');
  await page.click('[data-action="floor-picked"][data-sku="X000009560003"]');
  await page.click('[data-action="floor-oos"][data-sku="X000005100001"]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('flr-08-replen-holding', null);
  await page.click('#floor-replen-update');
  await page.waitForFunction(() => /^Updated/.test(document.getElementById('floor-replen-status').textContent));
  await go('floor/86');
  await shot('flr-09-86', '#floor-panel-86');

  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
