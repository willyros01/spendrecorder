#!/usr/bin/env bash
# SpendRecorder Android signed APK build; isolated from iOS/main and Expense Ledger.
# Fails closed if the permanent signing key is missing or changed.
set -euo pipefail
umask 077
node --version
node build/test-android.cjs
node build/test-android-media.cjs
npm install --no-audit --no-fund
npx cap add android
npx cap sync android
bash build/android-native.sh
test -f android/app/build.gradle
test -d node_modules/@capacitor-community/sqlite/android
test -s resources/icon.png
java build/AndroidIcons.java resources/icon.png android/app/src/main/res
# Monotonic Android versionCode per GitHub run; versionName follows package.json.
RUN_NUMBER="${GITHUB_RUN_NUMBER:-1}" node <<'JS'
const fs = require('fs');
const p = 'android/app/build.gradle';
const pkg = require('./package.json');
const code = 100000 + Number(process.env.RUN_NUMBER);
if (!Number.isSafeInteger(code) || code < 1 || code > 2100000000) throw Error('Android versionCode invalid');
let src = fs.readFileSync(p, 'utf8');
if (!/^\s*versionCode\s+\d+/m.test(src) || !/^\s*versionName\s+["'][^"']+["']/m.test(src)) {
  throw Error('Capacitor Android version fields were not found; refusing a guessed replacement');
}
src = src.replace(/^(\s*versionCode\s+)\d+/m, '$1' + code);
src = src.replace(/^(\s*versionName\s+)["'][^"']+["']/m, '$1"' + pkg.version + '"');
fs.writeFileSync(p, src);
console.log('SpendRecorder Android', pkg.version, 'versionCode', code);
JS
bash build/android-sign.sh
trap 'rm -f android/app/spendrecorder-signing.p12 android/app/spendrecorder-sign.gradle' EXIT
cd android
chmod +x ./gradlew
./gradlew --no-daemon assembleDebug
APK=app/build/outputs/apk/debug/app-debug.apk
test -s "$APK"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
test -n "$SDK"
SIGNER="$(find "$SDK/build-tools" -name apksigner -type f | sort -V | tail -1)"
test -n "$SIGNER"
"$SIGNER" verify --verbose --print-certs "$APK"
ACTUAL="$("$SIGNER" verify --print-certs "$APK" | sed -n 's/^.*certificate SHA-256 digest: *//p' | head -1 | tr 'A-F' 'a-f')"
EXPECTED="$(keytool -list -v -keystore app/spendrecorder-signing.p12 -storetype PKCS12 -storepass "$SPENDRECORDER_SIGNING_PASSWORD" -alias spendrecorder | sed -n 's/^[[:space:]]*SHA256: *//p' | head -1 | tr -d ':' | tr 'A-F' 'a-f')"
test -n "$ACTUAL" && test "$ACTUAL" = "$EXPECTED" || { echo "::error title=APK signer mismatch::Unexpected signing identity"; exit 1; }
echo "Verified persistent certificate SHA256: $ACTUAL"
sha256sum "$APK"
