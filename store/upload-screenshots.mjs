import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { api, create, getLocalization, getVersion, list, patch, relationship, version } from './apple.mjs';

const groups = [
  { directory: 'iPhone', display: 'APP_IPHONE_61', width: 1206, height: 2622 },
  { directory: 'iPad', display: 'APP_IPAD_PRO_3GEN_129', width: 2064, height: 2752 }
];
const names = ['01-new-expense', '02-history', '03-currencies', '04-recurring', '05-summary'];
const draft = await getVersion();
if (draft.attributes.versionString !== version) throw Error('Update the iOS draft version before uploading screenshots');
const localization = await getLocalization(draft);
if (!localization) throw Error('English (Canada) localization missing');

async function waitForDelivery(id) {
  for (let attempts = 0; attempts < 35; attempts++) {
    const { data } = await api('appScreenshots/' + id);
    const state = data.attributes.assetDeliveryState?.state;
    if (state === 'COMPLETE') return;
    if (state === 'FAILED') throw Error('Apple rejected screenshot ' + data.attributes.fileName);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw Error('Screenshot processing has not completed: ' + id);
}

async function upload(group) {
  const approvedNames = names.filter(name => group.directory !== 'iPhone' || name !== '04-recurring');
  const assets = approvedNames.map(name => {
    const fileName = 'SpendRecorder-' + group.directory + '-' + name + '.png';
    const bytes = fs.readFileSync('captures/' + group.directory + '/' + name + '.png');
    if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== group.width ||
        bytes.readUInt32BE(20) !== group.height || bytes[24] !== 8 || bytes[25] !== 2) {
      throw Error('Invalid RGB screenshot dimensions or format: ' + fileName);
    }
    const checksum = createHash('md5').update(bytes).digest('hex');
    return { fileName, bytes, checksum };
  });
  const sets = await list('appStoreVersionLocalizations/' + localization.id + '/appScreenshotSets?limit=200');
  let set = sets.find(row => row.attributes.screenshotDisplayType === group.display);
  if (!set) {
    set = (await create('appScreenshotSets', { screenshotDisplayType: group.display }, {
      appStoreVersionLocalization: relationship('appStoreVersionLocalizations', localization.id)
    })).data;
  }
  const original = await list('appScreenshotSets/' + set.id + '/appScreenshots?limit=50');
  const delivered = [];
  for (const asset of assets) {
    const existing = original.find(row => row.attributes.fileName === asset.fileName);
    if (existing?.attributes.sourceFileChecksum === asset.checksum && existing.attributes.assetDeliveryState?.state !== 'FAILED') {
      await waitForDelivery(existing.id);
      delivered.push(existing.id);
      continue;
    }
    if (existing) await api('appScreenshots/' + existing.id, 'DELETE');
    const { data: record } = await create('appScreenshots', { fileName: asset.fileName, fileSize: asset.bytes.length }, {
      appScreenshotSet: relationship('appScreenshotSets', set.id)
    });
    try {
      const operations = record.attributes.uploadOperations;
      if (!operations?.length) throw Error('Apple did not return upload operations');
      for (const op of operations) {
        if (!op.url.startsWith('https://') || op.method !== 'PUT') throw Error('Unexpected screenshot transfer operation');
        const headers = Object.fromEntries((op.requestHeaders || []).map(header => [header.name, header.value]));
        const res = await fetch(op.url, {
          method: op.method, headers, signal: AbortSignal.timeout(30000), body: asset.bytes.subarray(op.offset, op.offset + op.length)
        });
        if (!res.ok) throw Error('Apple screenshot transfer returned HTTP ' + res.status);
      }
      await patch('appScreenshots', record.id, { uploaded: true, sourceFileChecksum: asset.checksum });
    } catch (error) {
      await api('appScreenshots/' + record.id, 'DELETE').catch(() => {});
      throw error;
    }
    delivered.push(record.id);
  }
  await Promise.all(delivered.map(waitForDelivery));
  const readback = await list('appScreenshotSets/' + set.id + '/appScreenshots?limit=50');
  if (delivered.some(id => !readback.some(row => row.id === id && row.attributes.assetDeliveryState?.state === 'COMPLETE'))) {
    throw Error('Screenshot delivery readback incomplete');
  }
  console.log(group.directory + ': ' + delivered.length + ' screenshots COMPLETE, ' + group.width + ' × ' + group.height);
}

const devices = process.argv.slice(2);
const selected = devices.length ? groups.filter(group => devices.includes(group.directory)) : groups;
if (!selected.length || (devices.length && selected.length !== devices.length)) throw Error('Unknown screenshot device');
const results = await Promise.allSettled(selected.map(upload));
for (const result of results) if (result.status === 'rejected') console.error(result.reason.message);
if (results.some(result => result.status === 'rejected')) process.exitCode = 1;
