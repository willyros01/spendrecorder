#!/usr/bin/env bash
# Persistent Android APK signing for the isolated SpendRecorder/android branch.
# Secrets MUST be supplied by GitHub Actions. No fallback to a new debug key.
set -euo pipefail
umask 077

: "${SPENDRECORDER_SIGNING_KEYSTORE_BASE64:?Missing GitHub secret SPENDRECORDER_SIGNING_KEYSTORE_BASE64}"
: "${SPENDRECORDER_SIGNING_PASSWORD:?Missing GitHub secret SPENDRECORDER_SIGNING_PASSWORD}"

APP="android/app"
test -f "$APP/build.gradle"
STORE="$APP/spendrecorder-signing.p12"
printf '%s' "$SPENDRECORDER_SIGNING_KEYSTORE_BASE64" | base64 --decode > "$STORE"
chmod 600 "$STORE"
test -s "$STORE"

if ! keytool -list -keystore "$STORE" -storetype PKCS12 \
     -storepass "$SPENDRECORDER_SIGNING_PASSWORD" -alias spendrecorder >/dev/null 2>&1; then
  echo "::error title=Android signing invalid::Secret keystore/password/alias mismatch"
  exit 1
fi

cat > "$APP/spendrecorder-sign.gradle" <<'GRADLE'
android {
    signingConfigs {
        spendrecorderPersistent {
            storeFile file("spendrecorder-signing.p12")
            storePassword System.getenv("SPENDRECORDER_SIGNING_PASSWORD")
            keyAlias "spendrecorder"
            keyPassword System.getenv("SPENDRECORDER_SIGNING_PASSWORD")
            storeType "PKCS12"
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.spendrecorderPersistent
        }
    }
}
GRADLE

if ! grep -Fq 'apply from: "spendrecorder-sign.gradle"' "$APP/build.gradle"; then
  printf '\napply from: "spendrecorder-sign.gradle"\n' >> "$APP/build.gradle"
fi
echo "Stable Android signing configuration verified; private key stays in runner."
