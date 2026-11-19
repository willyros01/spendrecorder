import fs from 'node:fs';
import { api, create, getLocalization, getVersion, id, list, locale, optional, patch, ref, relationship, version, buildNumber } from './apple.mjs';

const copy = JSON.parse(fs.readFileSync(new URL('./listing.json', import.meta.url)));
for (const [name, max] of Object.entries({ subtitle: 30, keywords: 100, promotionalText: 170, description: 4000, notes: 4000 })) {
  if (!copy[name] || copy[name].length > max) throw Error('Invalid listing field ' + name);
}
const draft = await getVersion();
const errors = [];

async function step(label, action) {
  try {
    console.log('Verified ' + label, await action() ?? '');
  } catch (error) {
    errors.push(label);
    console.error(label + ': ' + error.message);
  }
}

await step('iOS version, copyright and automatic release', async () => {
  const attributes = { versionString: version, copyright: '2026 Wilfredo Rosales', releaseType: 'AFTER_APPROVAL' };
  await patch('appStoreVersions', draft.id, attributes);
  const { data } = await api('appStoreVersions/' + draft.id);
  for (const [key, value] of Object.entries(attributes)) if (data.attributes[key] !== value) throw Error('Readback mismatch: ' + key);
  return { version, state: data.attributes.appStoreState, releaseType: data.attributes.releaseType };
});

await step('English (Canada) description, keywords, promotions and URLs', async () => {
  const attributes = Object.fromEntries(['description', 'keywords', 'promotionalText', 'supportUrl', 'marketingUrl'].map(key => [key, copy[key]]));
  const loc = await getLocalization(draft);
  const saved = loc
    ? await patch('appStoreVersionLocalizations', loc.id, attributes)
    : await create('appStoreVersionLocalizations', { ...attributes, locale }, { appStoreVersion: relationship('appStoreVersions', draft.id) });
  const { data } = await api('appStoreVersionLocalizations/' + saved.data.id);
  for (const [key, value] of Object.entries(attributes)) if (data.attributes[key] !== value) throw Error('Readback mismatch: ' + key);
  return data.attributes.locale;
});

const infos = await api('apps/' + id + '/appInfos?include=appInfoLocalizations,ageRatingDeclaration&limit=200');
const info = infos.data.find(x => x.attributes.state === 'PREPARE_FOR_SUBMISSION' || x.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION') ||
  (infos.data.length === 1 ? infos.data[0] : null);

await step('Finance and Travel categories, subtitle and privacy policy', async () => {
  if (!info) throw Error('No unambiguous editable app information');
  await patch('appInfos', info.id, undefined, {
    primaryCategory: relationship('appCategories', 'FINANCE'), secondaryCategory: relationship('appCategories', 'TRAVEL')
  });
  const loc = infos.included?.find(x => x.type === 'appInfoLocalizations' && x.attributes.locale === locale);
  if (!loc) throw Error('App information localization missing');
  const attrs = { subtitle: copy.subtitle, privacyPolicyUrl: copy.privacyPolicyUrl };
  await patch('appInfoLocalizations', loc.id, attrs);
  const { data } = await api('appInfoLocalizations/' + loc.id);
  for (const [key, value] of Object.entries(attrs)) if (data.attributes[key] !== value) throw Error('Readback mismatch: ' + key);
});

const rights = (await api('apps/' + id + '?fields[apps]=contentRightsDeclaration')).data.attributes?.contentRightsDeclaration;
console.log('Content-rights value currently reported by Apple: ' + (rights ?? 'unavailable'));
console.log('Content rights need confirmation for the external exchange-rate data used by this build.');

await step('age-rating questionnaire', async () => {
  const age = infos.included?.find(x => x.type === 'ageRatingDeclarations' && x.id === info?.relationships?.ageRatingDeclaration?.data?.id) ||
    (infos.data.length === 1 && infos.included?.find(x => x.type === 'ageRatingDeclarations'));
  if (!age) throw Error('Age questionnaire missing');
  const booleans = ['ageAssurance', 'advertising', 'gambling', 'healthOrWellnessTopics', 'lootBox', 'messagingAndChat',
    'parentalControls', 'socialMedia', 'socialMediaAgeRestricted', 'unrestrictedWebAccess', 'userGeneratedContent'];
  const frequency = ['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gunsOrOtherWeapons', 'horrorOrFearThemes',
    'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity',
    'sexualContentOrNudity', 'gamblingSimulated', 'violenceCartoonOrFantasy', 'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic'];
  const answers = {};
  for (const name of booleans) if (name in age.attributes) answers[name] = false;
  for (const name of frequency) if (name in age.attributes) answers[name] = 'NONE';
  if (!('unrestrictedWebAccess' in answers && 'gamblingSimulated' in answers)) throw Error('Unexpected age-rating schema');
  await patch('ageRatingDeclarations', age.id, answers);
  const { data } = await api('ageRatingDeclarations/' + age.id);
  for (const [key, value] of Object.entries(answers)) if (data.attributes[key] !== value) throw Error('Readback mismatch: ' + key);
  return Object.keys(answers).length + ' answers';
});

await step('reviewer instructions and private contact', async () => {
  const current = await optional('appStoreVersions/' + draft.id + '/appStoreReviewDetail');
  let contact = current?.attributes;
  if (!contact?.contactPhone) {
    const existing = await api('apps/6833284199/appStoreVersions?include=appStoreReviewDetail&limit=20');
    contact = existing.included?.find(x => x.type === 'appStoreReviewDetails' && x.attributes.contactPhone)?.attributes;
  }
  if (!contact?.contactPhone || !contact.contactEmail || !contact.contactFirstName || !contact.contactLastName) {
    throw Error('Review contact needs a complete private record in App Store Connect');
  }
  const { contactPhone, contactEmail, contactFirstName, contactLastName } = contact;
  const attributes = { contactPhone, contactEmail, contactFirstName, contactLastName, demoAccountRequired: false, notes: copy.notes };
  if (current) await patch('appStoreReviewDetails', current.id, attributes);
  else await create('appStoreReviewDetails', attributes, { appStoreVersion: relationship('appStoreVersions', draft.id) });
  const saved = (await api('appStoreVersions/' + draft.id + '/appStoreReviewDetail')).data.attributes;
  if (saved.notes !== copy.notes || saved.demoAccountRequired !== false || !saved.contactPhone) throw Error('Review details did not persist');
});

await step('valid iOS build 12 and export compliance', async () => {
  const records = await api('builds?filter[app]=' + id + '&filter[version]=' + buildNumber + '&include=preReleaseVersion&limit=50');
  const build = records.data.find(row => row.attributes.processingState === 'VALID' && !row.attributes.expired &&
    records.included?.some(item => item.id === row.relationships.preReleaseVersion.data.id && item.attributes.version === version && item.attributes.platform === 'IOS'));
  if (!build) throw Error('Exact eligible iOS build was not found');
  if (build.attributes.usesNonExemptEncryption !== false) throw Error('Build export compliance requires verification');
  await api('appStoreVersions/' + draft.id + '/relationships/build', 'PATCH', { data: ref('builds', build.id) });
  const saved = (await api('appStoreVersions/' + draft.id + '/build')).data;
  if (saved.id !== build.id) throw Error('Build attachment did not persist');
  return { version, build: saved.attributes.version, processing: saved.attributes.processingState };
});

await step('free pricing', async () => {
  let schedule = await optional('apps/' + id + '/appPriceSchedule');
  let prices;
  const readPrices = async () => {
    try { return await api('appPriceSchedules/' + schedule.id + '/manualPrices?include=appPricePoint&limit=200'); }
    catch (error) { if (error.status !== 404) throw error; }
  };
  if (schedule) prices = await readPrices();
  if (!prices?.data.length) {
    const point = (await list('apps/' + id + '/appPricePoints?filter[territory]=CAN&limit=200'))
      .find(row => Number(row.attributes.customerPrice) === 0);
    if (!point) throw Error('Free Canadian price point missing');
    const price = ref('appPrices', '${price}');
    await api('appPriceSchedules', 'POST', {
      data: { type: 'appPriceSchedules', relationships: { app: relationship('apps', id), baseTerritory: relationship('territories', 'CAN'), manualPrices: { data: [price] } } },
      included: [{ ...price, attributes: { startDate: null }, relationships: { appPricePoint: relationship('appPricePoints', point.id) } }]
    });
    schedule = (await api('apps/' + id + '/appPriceSchedule')).data;
    prices = await readPrices();
  }
  const points = prices?.included?.filter(x => x.type === 'appPricePoints');
  if (!points?.length || points.some(x => Number(x.attributes.customerPrice) !== 0)) throw Error('Existing schedule could not be verified as free');
});

await step('territory availability', async () => {
  let availability = await optional('apps/' + id + '/appAvailabilityV2');
  const readTerritories = row => list('/v2/appAvailabilities/' + row.id + '/territoryAvailabilities?include=territory&limit=200');
  if (!availability) {
    // The SpendRecorder listing plan calls for the same worldwide distribution as the other Cuberoot apps.
    const precedent = await optional('apps/6833284199/appAvailabilityV2');
    if (!precedent) throw Error('The existing worldwide distribution reference is unavailable');
    const source = (await readTerritories(precedent)).filter(row => row.attributes.available);
    if (!source.length) throw Error('No territories on the verified distribution reference');
    const included = source.map((row, index) => ({
      ...ref('territoryAvailabilities', '${territory' + index + '}'),
      attributes: { available: true, preOrderEnabled: false },
      relationships: { territory: relationship('territories', row.relationships.territory.data.id) }
    }));
    await api('/v2/appAvailabilities', 'POST', {
      data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: precedent.attributes.availableInNewTerritories },
        relationships: { app: relationship('apps', id), territoryAvailabilities: { data: included.map(({ type, id }) => ref(type, id)) } } },
      included
    });
    availability = (await api('apps/' + id + '/appAvailabilityV2')).data;
    const selected = (await readTerritories(availability)).filter(row => row.attributes.available);
    if (selected.length !== source.length) throw Error('Worldwide selections did not fully persist');
  }
  const territories = await readTerritories(availability);
  const selected = territories.filter(x => x.attributes.available).length;
  if (!selected) throw Error('No countries/regions selected');
  return { selected, automaticFutureTerritories: availability.attributes.availableInNewTerritories };
});

if (errors.length) throw Error('Incomplete Apple preparation steps: ' + errors.join(', '));
