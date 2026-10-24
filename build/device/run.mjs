/* SpendRecorder device journeys: REAL native SQLite on disposable emulators.
 * No Firebase, production credentials, signed release APK, or TestFlight upload.
 * Each step records the UI, a database assertion, and a screenshot. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const platform = process.argv[2];
const OUT = path.resolve(process.argv[3] || 'out-device');
const app = process.argv[4];
const APP = 'io.github.willyros01.spendrecorder';
if (!['android', 'ios'].includes(platform) || !app) throw new Error('Usage: node run.mjs android|ios out-dir path-to-debug-app');
fs.mkdirSync(OUT, { recursive: true });
const d = await import(platform === 'android' ? './adb.mjs' : './sim.mjs');
if (platform === 'android') d.use(APP);
const report = [];
const shots = [];
let passed = 0, failed = 0;
const sleep = d.sleep;
function log(message) { report.push(message); console.log(message); fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n') + '\n'); }
function image(name) {
  const file = `${String(shots.length + 1).padStart(2, '0')}-${name}.png`;
  d.shot(path.join(OUT, file));
  shots.push({ name, file });
  log(`    Screenshot: ${file}`);
}
async function waitFor(predicate, label, timeoutMs = 30000) {
  const limit = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < limit) {
    try { if (await predicate()) return; } catch (e) { last = e.message; }
    await sleep(750);
  }
  throw new Error(`Timeout waiting for ${label}${last ? ': ' + last.slice(0, 200) : ''}`);
}
async function press(selector) {
  const ok = await d.js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
  if (!ok) throw new Error(`Missing button ${selector}`);
  await sleep(250);
}
async function textButton(label, root = 'document') {
  const ok = await d.js(`(() => { const els = [...${root}.querySelectorAll('button')]; const el = els.find(x => x.textContent.trim() === ${JSON.stringify(label)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
  if (!ok) throw new Error(`Missing button labelled ${label}`);
  await sleep(350);
}
async function input(selector, value) {
  const ok = await d.js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set; if (setter) setter.call(el, ${JSON.stringify(value)}); else el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`);
  if (!ok) throw new Error(`Missing input ${selector}`);
  await sleep(350);
}
/* Safari Web Inspector handles synchronous expressions reliably. An async app
 * operation is started inside the app and polled, so it uses the actual native
 * SQLite plugin rather than a browser-side mock or a parallel test database. */
async function native(body) {
  const begun = await d.js(`(() => { window.__srDeviceProbe = {done:false}; (async () => { ${body} })().then(value => window.__srDeviceProbe = {done:true, value}, error => window.__srDeviceProbe = {done:true, error:String(error?.message || error)}); return true; })()`);
  if (!begun) throw new Error('Native app probe did not start');
  let result;
  await waitFor(async () => {
    const raw = await d.js('JSON.stringify(window.__srDeviceProbe)');
    if (!raw) return false;
    result = JSON.parse(raw);
    return result.done;
  }, 'native SQLite operation', 35000);
  if (result.error) throw new Error(`SQLite operation failed: ${result.error}`);
  return result.value;
}
const snapshot = () => native('return await window.Store.load();');
async function records() { return (await snapshot()).entries; }
async function assertRecord(count, amount) {
  let entries;
  await waitFor(async () => {
    entries = await records();
    return entries.length === count && (amount === undefined || entries.some(x => Math.abs(x.amount - amount) < 0.001));
  }, `SQLite contains ${count} records${amount === undefined ? '' : ', including amount ' + amount}`);
  return entries;
}
async function step(id, title, action) {
  log(`\n${id}: ${title}`);
  try { await action(); passed++; log(`PASS ${id}`); }
  catch (e) {
    failed++;
    try { image(`${id}-failure`); } catch {}
    log(`FAIL ${id}: ${String(e.stack || e).slice(0, 950)}`);
    throw e;
  }
}
function makeMarkdown() {
  const status = failed ? 'FAIL' : 'PASS';
  const lines = [
    `# SpendRecorder ${platform === 'ios' ? 'iPhone' : 'Android'} simulator report`, '',
    `- Result: **${status}** — ${passed} passed, ${failed} failed`,
    `- GitHub Actions run: ${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY || 'willyros01/spendrecorder'}/actions/runs/${process.env.GITHUB_RUN_ID || 'local'}`,
    `- Test harness branch: android`,
    `- Test harness commit: ${process.env.GITHUB_SHA || 'local'}`,
    `- Native test app: ${platform === 'ios' ? 'read-only main checkout' : 'android branch'} (debug simulator build)`,
    '- Database: private, disposable **native SQLite**, not Firebase', '',
    '## Step-by-step result', '', '```text', ...report, '```', '', '## Screen captures', ''
  ];
  for (const shot of shots) lines.push(`### ${shot.name}`, '', `![${shot.name}](${shot.file})`, '');
  lines.push('## Limits', '',
    '- This report proves only the steps marked PASS. Missing steps are NOT TESTED.',
    '- Simulator-driven DOM interactions do not establish physical hit-target or accessibility behavior.',
    '- The receipt test uses an image fixture to verify SQLite persistence, not a physical camera.',
    '- The iPhone simulator cannot establish that the native sharing sheet saves into a user-selected cloud folder.',
    '- Fire HD 8 and physical iPhone acceptance remain separate.', '');
  fs.writeFileSync(path.join(OUT, 'REPORT.md'), lines.join('\n'));
}

try {
  log(`SpendRecorder ${platform.toUpperCase()} native-device test; temporary simulator data only`);
  if (platform === 'android') d.reinstall(APP, app);
  else d.reinstall(APP, app);
  d.launch(APP);
  await d.waitApp(/Terms of Use/, 60000);
  await step('S1', 'First-use Terms and real native SQLite', async () => {
    if (!(await d.js('window.Store && Store.isNative && !!window.Capacitor?.Plugins?.CapacitorSQLite'))) throw new Error('Native SQLite is unavailable; browser fallback is not accepted');
    image('terms-before-accept');
    await press('.termsgate input[type="checkbox"]');
    await textButton('Accept');
    await waitFor(async () => !!(await d.js('!!document.querySelector("form.newgrid")')), 'New expense form after Terms acceptance', 35000);
    const state = await snapshot();
    if (!state.settings?.terms) throw new Error('Terms acceptance was not saved in SQLite');
    image('new-expense-ready');
  });

  await step('S2', 'Enter a CAD expense through the app and verify native SQLite', async () => {
    await input('form input[type="number"]', '25.50');
    await input('form select.fld', '__new__');
    await waitFor(async () => !!(await d.js('!!document.querySelector("input[placeholder=\\"New vendor name\\"]")')), 'new vendor entry');
    await input('input[placeholder="New vendor name"]', 'Simulator Grocer');
    const addVendor = await d.js(`(() => { const i=document.querySelector('input[placeholder="New vendor name"]'); const b=[...i.parentElement.querySelectorAll('button')].find(x=>x.textContent.trim()==='Add'); if(!b) return false; b.click(); return true; })()`);
    if (!addVendor) throw new Error('Could not add test vendor');
    await waitFor(async () => (await snapshot()).vendors.includes('Simulator Grocer'), 'test vendor committed to SQLite');
    await input('form textarea', 'Disposable simulator expense');
    image('expense-form');
    await press('form button[type="submit"]');
    await assertRecord(1, 25.50);
    await press('.tabbar button:nth-child(2)');
    await d.waitApp(/Simulator Grocer/);
    image('expense-in-history');
  });

  await step('S3', 'Force-close and relaunch; SQLite expense and Terms survive', async () => {
    if (platform === 'android') {
      d.clearLog();
      execFileSync('adb', ['shell', 'am', 'force-stop', APP]);
    } else d.terminate(APP);
    d.disconnect?.();
    await sleep(1500);
    d.launch(APP);
    await waitFor(async () => !!(await d.js('!!document.querySelector("form.newgrid")')), 'New form after app restart', 45000);
    const state = await snapshot();
    if (!state.settings?.terms || state.entries.length !== 1 || Math.abs(state.entries[0].amount - 25.50) > 0.001) throw new Error('Reopened SQLite data do not match');
    await press('.tabbar button:nth-child(2)');
    await d.waitApp(/Simulator Grocer/);
    image('history-after-app-restart');
  });

  await step('S4', 'Edit in UI, verify one updated SQLite row', async () => {
    await textButton('Edit');
    await d.waitApp(/Editing an existing expense/);
    await input('form input[type="number"]', '38.75');
    image('edit-form');
    await press('form button[type="submit"]');
    await assertRecord(1, 38.75);
    image('history-after-edit');
  });

  await step('S5', 'Delete then Undo without losing the record', async () => {
    await textButton('Delete');
    await d.waitApp(/1 deleted/);
    image('undo-visible');
    await press('.undobtn');
    await assertRecord(1, 38.75);
    await sleep(7000);
    await assertRecord(1, 38.75);
    image('history-restored');
  });

  await step('S6', 'Receipt fixture survives a SQLite transaction and app restart', async () => {
    const fake = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9QZ9DvUAAAAASUVORK5CYII=';
    const result = await native(`const s=await Store.load(); const en=s.entries[0]; await Store.commit([{op:'putEntry',entry:en,receipt:${JSON.stringify(fake)}}]); return await Store.getReceipt(en.id);`);
    if (result !== fake) throw new Error('Native receipt row was not saved');
    if (platform === 'android') execFileSync('adb', ['shell', 'am', 'force-stop', APP]);
    else d.terminate(APP);
    d.disconnect?.(); await sleep(800); d.launch(APP);
    await waitFor(async () => !!(await d.js('!!document.querySelector("form.newgrid")')), 'New form after receipt restart', 45000);
    const found = await native('const s=await Store.load(); return [s.entries[0].hasReceipt, await Store.getReceipt(s.entries[0].id)];');
    if (!found?.[0] || found[1] !== fake) throw new Error('Receipt did not survive app restart');
    await press('.tabbar button:nth-child(2)');
    await d.waitApp(/Simulator Grocer/);
    image('receipt-after-restart');
  });

  await step('S7', 'PHP expense, manual rate, and simulated rate-provider outage', async () => {
    await press('.tabbar button:nth-child(1)');
    /* The test copy has no reason to contact live exchange-rate providers.
     * This simulates a request failure without altering any app source file. */
    const stubbed = await d.js(`(() => { window.__srSavedFetch=window.fetch; window.fetch=()=>Promise.reject(new TypeError('simulated provider outage')); window.prompt=()=> '0.025'; return true; })()`);
    if (!stubbed) throw new Error('Could not simulate exchange-rate outage');
    await input('form input[type="number"]', '100');
    await press('button[aria-label="Currency of this expense"]');
    const picked = await d.js(`(() => { const b=[...document.querySelectorAll('.currow')].find(x=>x.querySelector('.curcode')?.textContent==='PHP'); if(!b) return false; b.click(); return true; })()`);
    if (!picked) throw new Error('PHP was not in the currency picker');
    await waitFor(async () => !!(await d.js('!!document.querySelector(".ratebox:not([disabled])")')), 'manual rate button', 35000);
    await press('.ratebox');
    await input('form select.fld', 'Simulator Grocer');
    image('php-manual-rate-form');
    await press('form button[type="submit"]');
    await assertRecord(2, 100);
    const php = (await records()).find(e => e.currency === 'PHP' && e.amount === 100);
    if (!php || Math.abs(php.rate - 0.025) > 0.00001 || Math.abs(php.amountHome - 2.5) > 0.001 || php.rateSource !== 'manual') throw new Error('PHP manual conversion was not committed correctly');
    await d.js('window.fetch=window.__srSavedFetch; true');
    image('php-expense-saved');
  });

  await step('S8', 'Delete commits after the six-second Undo period', async () => {
    await press('.tabbar button:nth-child(2)');
    await d.waitApp(/Simulator Grocer/);
    const deleted = await d.js(`(() => { const card=[...document.querySelectorAll('.expcard')].find(e=>e.textContent.includes('PHP')); const b=card && [...card.querySelectorAll('button')].find(x=>x.textContent.trim()==='Delete'); if(!b) return false; b.click(); return true; })()`);
    if (!deleted) throw new Error('Could not select the PHP expense for deletion');
    image('delete-pending');
    await sleep(7500);
    const left = await assertRecord(1, 38.75);
    if (left.some(x => x.currency === 'PHP')) throw new Error('The PHP expense was not deleted from SQLite');
    image('delete-committed');
  });

  await step('S9', 'Summary and platform export', async () => {
    await press('.tabbar button:nth-child(3)');
    await waitFor(async () => (await d.js('document.querySelector(".pagehead .h1")?.innerText')) === 'Summary', 'Summary screen');
    image('summary-total');
    await textButton('Export');
    image('export-options');
    await textButton('CSV (.csv)');
    await sleep(3500);
    if (platform === 'android') {
      const files = execFileSync('adb', ['shell', 'ls', '-l', '/sdcard/Download'], { encoding: 'utf8' });
      if (!/spendrecorder-\d{4}-\d{2}-\d{2}\.csv/.test(files)) throw new Error('No CSV file in Android Downloads');
      image('csv-saved-to-downloads');
    } else {
      const container = execFileSync('xcrun', ['simctl', 'get_app_container', process.env.UDID, APP, 'data'], { encoding:'utf8' }).trim();
      const matches = execFileSync('find', [container, '-type', 'f', '-name', 'spendrecorder-*.csv'], { encoding:'utf8' }).trim();
      if (!matches) throw new Error('No CSV file generated in the simulator app container');
      image('ios-share-sheet');
    }
  });
} catch (e) {
  if (!failed) failed++;
  log(`\nStopped after test failure: ${String(e.message || e).slice(0, 400)}`);
} finally {
  log(`\nFINAL RESULT: ${passed} passed, ${failed} failed`);
  makeMarkdown();
  d.disconnect?.();
}
process.exit(failed ? 1 : 0);
