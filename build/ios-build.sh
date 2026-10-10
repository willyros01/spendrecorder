#!/usr/bin/env bash
# SpendRecorder — build the iOS app and upload it to TestFlight.
#
# Run by GitHub Actions on a Mac (see build/github-workflow.yml). Everything the
# build does lives in THIS visible file, so future changes never need the hidden
# .github folder touched again.
#
# Needs these environment variables (GitHub repository secrets):
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, APPLE_TEAM_ID
# and RUN_NUMBER (the build number, rising every run).

set -euo pipefail

for v in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8 APPLE_TEAM_ID; do
  if [ -z "${!v:-}" ]; then
    echo "::notice title=Build skipped::The Apple secret $v is not set yet. See HANDOVER.md, step 4."
    exit 0
  fi
done

TMP="${RUNNER_TEMP:-/tmp}"
VERSION=$(node -p "require('./package.json').version")
BUILD="${RUN_NUMBER:-1}"
echo "Building SpendRecorder $VERSION (build $BUILD)"

echo "--- Install Capacitor and plugins"
npm install --no-audit --no-fund

echo "--- Generate the iOS project (fresh every build)"
rm -rf ios
npx cap add ios
npx cap sync ios

echo "--- Permission text, display name"
PLIST=ios/App/App/Info.plist
plutil -replace NSCameraUsageDescription -string "SpendRecorder uses the camera to photograph receipts you choose to attach to an expense." "$PLIST"
plutil -replace NSPhotoLibraryUsageDescription -string "SpendRecorder opens your photo library so you can attach a receipt photo to an expense." "$PLIST"
plutil -replace CFBundleDisplayName -string "SpendRecorder" "$PLIST"
# Export compliance: the SQLite component includes an encryption library (SQLCipher),
# but SpendRecorder's database is NOT encrypted; the only encryption used is HTTPS through iOS,
# which is exempt — the same answer as Fairpot.
plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$PLIST"

echo "--- App icon"
ICONSET=ios/App/App/Assets.xcassets/AppIcon.appiconset
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
cp resources/icon.png "$ICONSET/AppIcon-1024.png"
cat > "$ICONSET/Contents.json" <<'JSON'
{
  "images": [
    { "filename": "AppIcon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024" }
  ],
  "info": { "author": "xcode", "version": 1 }
}
JSON

echo "--- Launch screen image"
SPLASH=ios/App/App/Assets.xcassets/Splash.imageset
if [ -d "$SPLASH" ]; then
  rm -f "$SPLASH"/*.png
  cp resources/splash.png "$SPLASH/splash.png"
  cat > "$SPLASH/Contents.json" <<'JSON'
{
  "images": [
    { "idiom": "universal", "filename": "splash.png", "scale": "1x" },
    { "idiom": "universal", "filename": "splash.png", "scale": "2x" },
    { "idiom": "universal", "filename": "splash.png", "scale": "3x" }
  ],
  "info": { "author": "xcode", "version": 1 }
}
JSON
else
  echo "(no Splash image set in this Capacitor template — keeping the default launch screen)"
fi

echo "--- App Store Connect key"
mkdir -p "$TMP/keys"
KEY="$TMP/keys/AuthKey_${ASC_KEY_ID}.p8"
printf '%s\n' "$ASC_KEY_P8" > "$KEY"
trap 'rm -rf "$TMP/keys"' EXIT

AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$KEY"
      -authenticationKeyID "$ASC_KEY_ID"
      -authenticationKeyIssuerID "$ASC_ISSUER_ID")

echo "--- Verify App Store Connect authentication"
KEY="$KEY" node <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = [
  encode({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' }),
  encode({
    iss: process.env.ASC_ISSUER_ID,
    iat: now,
    exp: now + 300,
    aud: 'appstoreconnect-v1'
  })
].join('.');

let signature;
try {
  signature = crypto.sign('sha256', Buffer.from(unsigned), {
    key: fs.readFileSync(process.env.KEY),
    dsaEncoding: 'ieee-p1363'
  }).toString('base64url');
} catch {
  console.error('Apple API preflight failed: ASC_KEY_P8 is not a readable private key.');
  process.exit(2);
}

const token = unsigned + '.' + signature;
https.get('https://api.appstoreconnect.apple.com/v1/apps?limit=1', {
  headers: { Authorization: 'Bearer ' + token }
}, response => {
  let body = '';
  response.setEncoding('utf8');
  response.on('data', chunk => { body += chunk; });
  response.on('end', () => {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log('Apple API preflight passed: credentials accepted (HTTP ' + response.statusCode + ').');
      return;
    }
    console.error('Apple API preflight failed: HTTP ' + response.statusCode + '.');
    try {
      const parsed = JSON.parse(body);
      for (const error of parsed.errors || []) {
        console.error((error.code || 'APPLE_ERROR') + ': ' + (error.title || error.detail || 'Authentication rejected.'));
      }
    } catch {
      console.error('Apple returned a non-JSON error response.');
    }
    process.exitCode = 3;
  });
}).on('error', error => {
  console.error('Apple API preflight request failed: ' + error.message);
  process.exitCode = 4;
});
NODE

echo "--- Build and sign"
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$TMP/App.xcarchive" \
  "${AUTH[@]}" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY="-" \
  AD_HOC_CODE_SIGNING_ALLOWED=YES \
  MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD" \
  -quiet

echo "--- Upload to TestFlight"
cat > "$TMP/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
xcodebuild -exportArchive \
  -archivePath "$TMP/App.xcarchive" \
  -exportOptionsPlist "$TMP/ExportOptions.plist" \
  -exportPath "$TMP/export" \
  "${AUTH[@]}"

echo "::notice title=Uploaded::SpendRecorder $VERSION build $BUILD sent to App Store Connect. It appears in TestFlight after Apple finishes processing (usually 5–30 minutes)."
