import fs from 'node:fs';
import path from 'node:path';
import * as device from './sim.mjs';

const [app, out] = process.argv.slice(2);
const bundle = 'io.github.willyros01.spendrecorder';
fs.mkdirSync(out, { recursive: true });

async function act(expression) {
  if (!(await device.js(expression))) throw new Error('App interaction failed: ' + expression);
  await device.sleep(450);
}

async function fill(selector, value) {
  await act(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    return true;
  })()`);
}

async function capture(name, expected) {
  await device.waitApp(expected);
  await device.sleep(800);
  device.shot(path.join(out, name + '.png'));
}

try {
  device.reinstall(bundle, app);
  device.launch(bundle);
  await device.waitApp(/Terms of Use/, 60000);
  await device.press('.termsgate input[type="checkbox"]');
  await act(`(() => {
    const accept = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Accept');
    if (!accept) return false;
    accept.click();
    return true;
  })()`);
  await device.waitApp(/Receipt photo/);
  const fixture = [
    ['Harbour Café', 'Food & Dining', 18.5, 'CAD', 1, 'Lunch'],
    ['City Transit', 'Transportation', 320, 'PHP', 0.024, 'Airport transfer'],
    ['Maple Market', 'Food & Dining', 56.2, 'CAD', 1, 'Groceries'],
    ['Northside Internet', 'Utilities', 65, 'CAD', 1, 'Monthly internet'],
    ['Seaside Hotel', 'Accommodation', 4200, 'PHP', 0.024, 'Weekend stay'],
    ['Union Station', 'Transportation', 24.5, 'CAD', 1, 'Train fare']
  ];
  await act(`(() => {
    if (!window.Store?.isNative) return false;
    const sample = ${JSON.stringify(fixture)};
    const rows = sample.map(([vendor, category, amount, currency, rate, comments], index) => {
      const date = new Date();
      date.setDate(date.getDate() - index);
      const day = localDateStr(date);
      return {op:'putEntry', entry:{id:'demo-' + index, date:day, vendor, category, amount, currency, home:'CAD',
        rate, rateDate:day, rateSource:currency === 'CAD' ? 'home' : 'manual', amountHome: Math.round(amount * rate * 100) / 100,
        comments, createdAt:Date.now() - index * 1000}};
    });
    window.screenshotSeed = 'pending';
    Store.commit([{op:'setVendors', list:sample.map(row => row[0])}, ...rows])
      .then(() => Store.load())
      .then(state => { window.screenshotSeed = state.entries.length === rows.length ? 'ready' : 'row count mismatch'; })
      .catch(error => { window.screenshotSeed = String(error); });
    return true;
  })()`);
  for (let count = 0; count < 40; count++) {
    const state = await device.js('window.screenshotSeed');
    if (state === 'ready') break;
    if (state !== 'pending' || count === 39) throw new Error('Demo data seeding: ' + state);
    await device.sleep(500);
  }
  device.disconnect();
  device.terminate(bundle);
  device.launch(bundle);
  await device.waitApp(/Receipt photo/, 60000);

  await device.press('button[aria-label="Currency of this expense"]');
  await capture('03-currencies', /Currency of this expense/);
  await act(`(() => {
    const candidate = [...document.querySelectorAll('.currow')].find(x => x.querySelector('.curcode')?.textContent === 'PHP');
    if (!candidate) return false;
    window.prompt = () => '0.024';
    candidate.click();
    return true;
  })()`);
  await fill('form input[type="number"]', '845.50');
  await fill('form select.fld', 'Harbour Café');
  await device.waitApp(/Tap to type your own rate/, 60000);
  await act(`(() => {
    const rate = document.querySelector('.ratebox:not([disabled])');
    if (!rate) return false;
    rate.click();
    return true;
  })()`);
  await act('window.scrollTo(0, 0); true');
  for (let count = 0; count < 15 && await device.js("!!document.querySelector('.toast')"); count++) await device.sleep(400);
  await capture('01-new-expense', /Use the looked-up rate instead/);

  await device.press('.recurring-row input');
  await fill('#repeat-frequency', 'monthly');
  await act("document.querySelector('#recurring-options').scrollIntoView({block:'center'}); true");
  await capture('04-recurring', /Next due:/);

  await device.press('.tabbar button:nth-child(2)');
  await act('window.scrollTo(0, 0); true');
  await capture('02-history', /Harbour Café/);

  await device.press('.tabbar button:nth-child(3)');
  await act('window.scrollTo(0, 0); true');
  await capture('05-summary', /Summary/);
} finally {
  device.disconnect();
}
