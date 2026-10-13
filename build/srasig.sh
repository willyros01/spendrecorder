#!/usr/bin/env bash
# SRASIG: one-time private SpendRecorder Android signing setup, in YOUR Google Cloud Shell.
# No private keys or passwords are committed to GitHub or printed to this chat.
# Run ONLY inside a shell you control. Re-running reuses the same key.
set -euo pipefail
umask 077

REPO="willyros01/spendrecorder"
DIR="$HOME/spendrecorder-sign"
KEY="$DIR/spendrecorder.p12"
PW="$DIR/password.txt"

echo "SpendRecorder Android permanent signing setup"
echo "Repo: $REPO"
echo "No iOS or main branch is modified."

# Google Cloud Shell is Debian-based. Install missing command-line tools.
NEED=()
command -v gh >/dev/null || NEED+=(gh)
command -v keytool >/dev/null || NEED+=(default-jdk-headless)
command -v openssl >/dev/null || NEED+=(openssl)
if [ "${#NEED[@]}" -gt 0 ]; then
  echo "Installing required tools: ${NEED[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y -qq "${NEED[@]}"
fi

if ! gh auth status >/dev/null 2>&1; then
  echo ""
  echo "One-time GitHub CLI authorization required."
  echo "Follow the code or browser instructions. Use your account with access to $REPO."
  gh auth login --hostname github.com --git-protocol https --web --scopes repo
fi

mkdir -p "$DIR"
chmod 700 "$DIR"

if [ -f "$KEY" ] && [ -f "$PW" ]; then
  echo "Reusing existing private signing key. This is required for future updates."
elif [ ! -e "$KEY" ] && [ ! -e "$PW" ]; then
  echo "Creating permanent SpendRecorder signing key..."
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
  echo "STOP: key/password mismatch. Do NOT generate another key."
  echo "Please restore your original $KEY and $PW."
  exit 1
fi

# Prove the saved key can be opened before setting GitHub secrets.
PASSWORD="$(cat "$PW")"
keytool -list -storetype PKCS12 -keystore "$KEY" \
  -storepass "$PASSWORD" -alias spendrecorder >/dev/null
unset PASSWORD

echo "Uploading ONLY encrypted GitHub Actions secrets..."
base64 -w 0 "$KEY" | gh secret set SPENDRECORDER_SIGNING_KEYSTORE_BASE64 --repo "$REPO"
gh secret set SPENDRECORDER_SIGNING_PASSWORD --repo "$REPO" < "$PW"

echo ""
echo "Checking secret names (not values)..."
gh secret list --repo "$REPO" | grep -E '^SPENDRECORDER_SIGNING_(KEYSTORE_BASE64|PASSWORD)[[:space:]]'
echo ""
echo "SUCCESS: permanent Android signing secrets configured."
echo "Starting the newly signed Android APK build automatically..."
gh workflow run android-apk.yml --ref android --repo "$REPO"
echo "Build queued. The Cuberoot publisher will update the website after success."
echo "IMPORTANT: Make a PRIVATE offline copy of BOTH files now:"
echo "$KEY"
echo "$PW"
echo ""
echo "Google Cloud Shell storage is NOT a permanent backup."
echo "Never paste these secrets in ChatGPT or commit them to a repository."
echo "Then tell ChatGPT: SRASIG DONE."
