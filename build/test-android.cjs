// Deterministic Android packaging / shared SQLite-safety regression preflight.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(p.name, 'spendrecorder');
for (const dep of ['@capacitor/android', '@capacitor/core', '@capacitor-community/sqlite', '@capacitor/filesystem', '@capacitor/share']) {
  assert.ok(p.dependencies[dep], 'Required Android runtime dependency: ' + dep);
}
const config = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
assert.equal(config.appId, 'io.github.willyros01.spendrecorder');
assert.equal(config.appName, 'SpendRecorder');
assert.equal(config.webDir, 'www');
assert.equal(config.plugins.CapacitorSQLite.androidIsEncryption, false);
const html = fs.readFileSync('www/index.html', 'utf8');
assert.match(html, /SpendRecorder/);
assert.match(html, /storage\.js/);
assert.match(html, /app\.js/);
const storage = fs.readFileSync('www/storage.js', 'utf8');
assert.match(storage, /CapacitorSQLite/);
assert.match(storage, /executeSet\(\{\s*database:\s*DBNAME,\s*set:\s*set,\s*transaction:\s*true/);
assert.match(storage, /SQL\.open\(\{/);
assert.match(storage, /storageBlocked/);
const app = fs.readFileSync('www/app.js', 'utf8');
assert.match(app, /Store\.open\(\)/);
assert.match(app, /Store\.commit\(/);
assert.match(app, /shareFileNative/);
const sign = fs.readFileSync('build/android-sign.sh', 'utf8');
assert.match(sign, /SPENDRECORDER_SIGNING_KEYSTORE_BASE64/);
assert.match(sign, /SPENDRECORDER_SIGNING_PASSWORD/);
assert.doesNotMatch(sign, /keytool -genkeypair/);
for (const file of ['resources/icon.png', 'www/lib/react.bundle.js', 'www/lib/xlsx.full.min.js']) {
  assert.ok(fs.statSync(file).size > 1024, 'Missing bundled Android asset: ' + file);
}
console.log('PASS: Android package, SQLite transactional data, bundled assets and persistent signing contract');
