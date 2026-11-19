import { createPrivateKey, sign } from 'node:crypto';

const origin = 'https://api.appstoreconnect.apple.com';
for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8']) {
  if (!process.env[name]?.trim()) throw Error('Missing GitHub Actions secret ' + name);
}
const key = createPrivateKey(process.env.ASC_KEY_P8.trim());
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const id = '6821221103';
const locale = 'en-CA';
const version = '1.1.3';
const buildNumber = '12';

function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'ES256', kid: process.env.ASC_KEY_ID.trim(), typ: 'JWT' });
  const claim = encode({ iss: process.env.ASC_ISSUER_ID.trim(), iat: now, exp: now + 300, aud: 'appstoreconnect-v1' });
  const unsigned = header + '.' + claim;
  return unsigned + '.' + sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}

async function api(path, method = 'GET', body) {
  const url = new URL(path.startsWith('https:') || path.startsWith('/') ? path : '/v1/' + path, origin);
  if (url.origin !== origin) throw Error('Unexpected Apple API origin');
  const result = await fetch(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body)
  });
  const json = result.status === 204 ? {} : await result.json();
  if (!result.ok) {
    const err = Error(`Apple ${method} ${url.pathname}: HTTP ${result.status}. ${(json.errors || []).map(e => e.code + ' ' + e.title + ' ' + (e.source?.pointer || '')).join(', ')}`);
    err.status = result.status;
    throw err;
  }
  return json;
}

const ref = (type, id) => ({ type, id });
const relationship = (type, id) => ({ data: ref(type, id) });
const patch = (type, id, attributes, relationships) =>
  api(type + '/' + id, 'PATCH', { data: { type, id, attributes, relationships } });
const create = (type, attributes, relationships) =>
  api(type, 'POST', { data: { type, attributes, relationships } });

async function list(url) {
  const all = [];
  while (url) {
    const result = await api(url);
    all.push(...result.data);
    url = result.links?.next;
  }
  return all;
}

async function optional(path) {
  try { return (await api(path)).data; }
  catch (e) { if (e.status !== 404) throw e; }
}

async function getVersion() {
  const { data: app } = await api('apps/' + id);
  if (app.attributes.bundleId !== 'io.github.willyros01.spendrecorder' || app.attributes.primaryLocale !== locale) {
    throw Error('Apple app identity or locale mismatch');
  }
  const rows = await list('apps/' + id + '/appStoreVersions?filter[platform]=IOS&limit=200');
  const draft = rows.find(row => row.attributes.versionString === version) ||
    rows.find(row => row.attributes.versionString === '1.0');
  if (!draft || draft.attributes.appStoreState !== 'PREPARE_FOR_SUBMISSION') {
    throw Error('Expected editable iOS draft missing');
  }
  return draft;
}

async function getLocalization(draft) {
  return (await list('appStoreVersions/' + draft.id + '/appStoreVersionLocalizations?limit=200'))
    .find(row => row.attributes.locale === locale);
}

export { api, create, getLocalization, getVersion, id, list, locale, optional, patch, ref, relationship, version, buildNumber };
