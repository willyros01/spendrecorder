# SpendRecorder Android — isolated branch and automated APK delivery

## Baseline
- Repo: `willyros01/spendrecorder`; Android-only branch: `android` created from `main`.
- App: SpendRecorder `1.0.2`; Android package ID: `io.github.willyros01.spendrecorder`.
- Shared web UI: `www/`, generated from `src/app.jsx`; native on-device SQLite via `@capacitor-community/sqlite`.
- The original `willyros01/expense-ledger`, SpendRecorder `main`/iOS and all existing apps must stay unchanged.
- Android native project is generated fresh in GitHub Actions, never committed into the repo.
- Native launcher icon generated from `resources/icon.png` (the same artwork used on iOS).
- Android versionName from `package.json`; versionCode = 100000 + GitHub Actions run number.
- **No Firebase.** No cloud account. Expenses and receipt images are stored in the local SQLite database. This database may be lost on uninstall unless backed up through available app export.

## Build and automatic publication
1. Push Android application/build changes to `spendrecorder/android` or dispatch `android-apk.yml`.
2. Workflow `.github/workflows/android-apk.yml` requires the two permanent signing secrets and checks native/shared app files, then builds with Capacitor 8, Java 21 and Gradle.
3. Android APK is signed with **one persistent private keystore**, its certificate SHA256 is verified, and the APK is uploaded as artifact `spendrecorder-android-test-apk`.
4. Even when the build fails, GitHub Actions records the result in `build/android-last-run.json` (the report commit skips the build trigger).
5. Cuberoot `main`: `.github/workflows/publish-spendrecorder-apk.yml` checks the report every 5 minutes, and `build/publish-spendrecorder.sh` downloads the **exact successful APK artifact**.
6. Publisher checks the ZIP, APK signature, and signer continuity against the previously released APK; refuses missing, failed or obsolete builds. No rebuilding or re-signing in Cuberoot.
7. Publisher commits `downloads/spendrecorder.apk`, `downloads/spendrecorder.apk.sha256`, `downloads/spendrecorder-build.json` to Cuberoot `main`, triggering the existing Pages deployment.
8. Cuberoot app card displays the same-origin download button **only after** the signed APK and release metadata are present.
9. Public APK: `https://www.cuberoot-systems.com/downloads/spendrecorder.apk`; when published, use `?build=RUN_ID` to bypass Silk/browser cache. No GitHub repository URL is exposed by the button.

## Required one-time signing — cannot skip
- Required GitHub Actions secrets in SpendRecorder repo (names only):
  - `SPENDRECORDER_SIGNING_KEYSTORE_BASE64`
  - `SPENDRECORDER_SIGNING_PASSWORD`
- One-time private setup in Google Cloud Shell: `build/srasig.sh`. Script generates a PKCS12 signing key, saves key/password in private shell storage, and sets these GitHub Actions secrets using the authenticated `gh` CLI.
- The key is **never printed in chat, committed to the repository or passed through the Cuberoot publisher**.
- Script reuses an existing key on rerun; it refuses to replace a partial key/password set.
- Make an **offline private backup of both the keystore and password**. Losing either makes future APK updates impossible without uninstall/reinstall and local data loss.
- After encrypted GitHub secrets are saved, the script dispatches the Android build. Automatic website publication follows a confirmed successful run.
- **Fail-closed rule:** missing/invalid secrets cause a red build and no publication, rather than shipping an unstable debug-signed APK.

## Real-device acceptance — not yet done
After the first signed APK is live, test one item at a time on the Fire tablet:
1. APK download from Cuberoot, installation, icon and app launch.
2. First-use legal acceptance, Home CAD currency, and Dark Mode.
3. Add one expense; fully exit/reopen; confirm SQLite persistence.
4. Add a second currency and confirm exchange-rate source/amount.
5. Edit, remove, undo, vendor/category list, filters/summary totals.
6. Attach/view a receipt image and confirm it persists after restart.
7. Export Excel/CSV with the Android share sheet; confirm file exists or can be saved.
8. Import a small known test file, with no loss of preexisting expenses.
9. Offline add/read and reconnection (no unverified network dependence for saved data).
10. A++/accessibility, portrait/landscape, Fire Home/resume, app-update without losing SQLite records.

## Current status
- **PRE-FLIGHT PASS (GitHub run 38327473119):** App/package contract checks, shell syntax and native Capacitor Android + SQLite Java compilation succeeded. This does **not** prove APK signing, launch, or device behaviour.
- First signing build (38327179622) and the later signing stage of run 38327473119 stopped at **Require permanent Android signing secrets**. The status reporter worked and Cuberoot's publisher ran successfully but intentionally did not upload an unsigned APK.
- No signed APK has yet been built or published; signing setup is a hard blocker.
- Do not mark build, installation, on-device SQLite, or automatic Cuberoot publication PASS until separately verified.
