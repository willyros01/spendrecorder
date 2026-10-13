#!/usr/bin/env bash
# SRASIG: one-time PRIVATE SpendRecorder Android signing key preparation.
# You enter the TWO GitHub Actions secrets MANUALLY in GitHub Settings.
# This script never logs in to GitHub, uploads secrets or starts a build.
# Run only in a shell you control; reruns reuse the existing signing key.
set -euo pipefail
umask 077

DIR="$HOME/spendrecorder-sign"
KEY="$DIR/spendrecorder.p12"
PW="$DIR/password.txt"
B64="$DIR/keystore-b64.txt"

echo "SpendRecorder permanent Android signing setup (manual secrets)"
echo "Repository: willyros01/spendrecorder"
echo "Branch: android"
echo "No GitHub login, secret upload or build will be performed."

NEED=()
command -v keytool >/dev/null || NEED+=(default-jdk-headless)
command -v openssl >/dev/null || NEED+=(openssl)
command -v base64 >/dev/null || NEED+=(coreutils)
if [ "${#NEED[@]}" -gt 0 ]; then
  echo "Installing required tools: ${NEED[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y -qq "${NEED[@]}"
fi

mkdir -p "$DIR"
chmod 700 "$DIR"

if [ -f "$KEY" ] && [ -f "$PW" ]; then
  echo "Reusing existing permanent keystore and password."
elif [ ! -e "$KEY" ] && [ ! -e "$PW" ]; then
  echo "Generating ONE permanent signing key..."
  openssl rand -hex 24 > "$PW"
  chmod 600 "$PW"
  PASSWORD="$(cat "$PW")"
  keytool -genkeypair -alias spendrecorder -keyalg RSA -keysize 3072 \
    -validity 10000 -storetype PKCS12 \
    -keystore "$KEY" -storepass "$PASSWORD" -keypass "$PASSWORD" \
    -dname "CN=SpendRecorder Android Signing, O=Cuberoot Systems, C=CA" -noprompt
  unset PASSWORD
  chmod 600 "$KEY"
else
  echo "STOP: keystore/password mismatch. Do NOT create a replacement key."
  echo "Restore both original files into $DIR and retry."
  exit 1
fi

PASSWORD="$(cat "$PW")"
keytool -list -storetype PKCS12 -keystore "$KEY" \
  -storepass "$PASSWORD" -alias spendrecorder >/dev/null
unset PASSWORD
base64 -w 0 "$KEY" > "$B64"
chmod 600 "$B64"
test -s "$B64"

echo ""
echo "PASS: Existing or newly generated signing key verified."
echo "MANUAL GitHub secrets entry — Settings > Secrets and variables > Actions:"
echo "SPENDRECORDER_SIGNING_KEYSTORE_BASE64 : copy entire contents of $B64"
echo "SPENDRECORDER_SIGNING_PASSWORD        : copy entire contents of $PW"
echo ""
echo "Open these PRIVATE files in Cloud Shell Editor to select/copy their contents."
echo "Do NOT paste the values into ChatGPT, email or any repository."
echo "Keep a private OFFLINE backup of BOTH $KEY and $PW."
echo "Cloud Shell storage alone is not a permanent backup."
echo "Do not generate a new key for future APK updates."
echo ""
echo "After BOTH secrets are manually saved in GitHub, tell ChatGPT: SRASIG DONE"
