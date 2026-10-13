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
- Required GitHub Actions repository secrets (names only):
  - `SPENDRECORDER_SIGNING_KEYSTORE_BASE64`
  - `SPENDRECORDER_SIGNING_PASSWORD`
- **Owner's selected approach (2026-10-12):** ChatGPT generated the permanent keystore and password and supplied private downloadable files directly to the owner; the owner enters both values **MANUALLY** in GitHub `willyros01/spendrecorder` **Settings > Secrets and variables > Actions**. Do not require Google Cloud Shell or any signing-key generation script.
- Signing material is not stored in this repository or in Cuberoot. Private backup ZIP and secret text are handed to the owner through the current conversation only; no signing secrets are committed to git, sent to chat text, or uploaded automatically.
- Keystore is PKCS12, alias `spendrecorder`, RSA 3072-bit. Certificate SHA256 (public fingerprint only): `67f4284ccdc93bb75bbf939f76974888b3190eff46a1e2fb04489090749625fc`.
- Retain the **original keystore and its password** in private secure offline storage for every future update. Never generate another key for updates unless explicitly performing a destructive migration.
- The pre-existing `build/srasig.sh` is a legacy helper; **not required, not part of the owner's manual setup, and not to be run** for this signing key.
- Once the owner confirms **both** repository secrets are saved, dispatch `android-apk.yml` from the `android` branch. Automatic website publication follows only a confirmed successful run.
- **Fail-closed rule:** missing or invalid signing secrets cause a red build and no publication, rather than an ephemeral debug-signed APK.

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

## Current status — 2026-10-12 / signed APK publication PASS
- GitHub Actions run **38327473119**, attempt **2**, **SUCCESS**: native compile checks, permanent secret presence, signed Android APK build, APK signature/certificate verification, artifact upload, and release report complete.
- Signed APK artifact **11782522806**; source commit `57c0e7a670f78ea12b257c86fdf7abc2eb474057`.
- Permanent signer certificate SHA256: `67f4284ccdc93bb75bbf939f76974888b3190eff46a1e2fb04489090749625fc` (matches owner-provided signing key).
- Cuberoot publish workflow run **38331336483** **SUCCESS**. Repository `willyros01/Cuberoot` branch `main` contains `downloads/spendrecorder.apk`, checksum and `downloads/spendrecorder-build.json`; apk_bytes **13746647**.
- APK SHA256: `5e0cb50b59352e31ffb32739282a18a233171ef3da28735bdce6d238d4f45a51`; release metadata and SHA256 file agree.
- Cuberoot GitHub Pages deployment run **38331357495** **SUCCESS** for published APK commit `6ebf532dee984e681419fb706c5188b5dd5b51fe`.
- Planned direct download: `https://www.cuberoot-systems.com/downloads/spendrecorder.apk?build=38327473119`. External public HTTP download has not been independently verified here; site publication and Pages deployment were verified through GitHub.
- **Fire HD device install, launch, SQLite persistence, receipts, import/export, offline behavior and acceptance testing are NOT YET VERIFIED.** Do not label Android app accepted until real-device tests pass.
- Keep permanent signing key/password privately backed up; future APK updates must retain certificate identity.

## Android receipt camera + Downloads export repair — 2026-10-12
- Fire HD 8 reported two issues in the first signed APK: receipt image selection offered only Gallery, and CSV/Excel export invoked Android Share without a local save-to-file path. These are user-reported defects, not yet retested after this repair.
- Reference: `fairpot/android` uses the native Capacitor Camera plugin with `getPhoto({source:'PROMPT',resultType:'base64'})`, and its `FairpotDocument` plugin writes to Downloads using `MediaStore.Downloads` (Fire OS 8) or permission-gated public Downloads (Android 9).
- SpendRecorder Android only: add Capacitor Camera to Android `package.json`, use Android camera/gallery chooser in receipt UI; preserve native iOS and browser file input. Compress camera photo with existing image handling, preserving transactional SQLite receipt storage.
- SpendRecorder Android only: add `SpendRecorderDocument.saveToDownloads`, accepting strict CSV or XLSX Base64 and MIME; for Fire OS 8 use `MediaStore.Downloads`, for old Android use public Downloads and permission. Validate actual save result before displaying success; on missing/rejecting plugin show explicit error, never silently share or claim success. iOS/web share/export flows unchanged.
- Native bridge is registered via generated `MainActivity.java`; no manually committed Android project or Firebase work. Focused deterministic tests accompany build. Preserve original permanent certificate `67f4284ccdc93bb75bbf939f76974888b3190eff46a1e2fb04489090749625fc` for in-place updates.
- **Device acceptance pending:** install updated signed APK over current version WITHOUT uninstalling, verify prior expenses/receipt remain. Receipt Add photo shows Camera/Gallery chooser; take photo and save expense; confirm receipt after restart. Export CSV and Excel to Downloads, verify both exist and open. If any step fails report error and do not claim PASS.

### Receipt camera and file export — build result, 2026-10-12
- Owner-reported camera/gallery and save-to-file issues fixed on Android branch only. Fairpot Android's camera prompt and Downloads native MediaStore strategy were adapted to SpendRecorder CSV/XLSX (Base64 bytes, MIME, explicit save confirmation). iOS/main and original Expense Ledger remain unchanged.
- Version name and visible app version now **1.0.3**; source commit `2d36b8f3c2627ef2b89a11b2c13a3d176e0001e7`.
- **GitHub Android build 38333150238 PASS**: focused deterministic regression, native plugin compilation, permanent signing and APK artifact upload (`11783697208`). Certificate SHA256 `67f4284ccdc93bb75bbf939f76974888b3190eff46a1e2fb04489090749625fc` matches prior 1.0.2 release.
- **Cuberoot publisher 38333065239 attempt 2 PASS**, main published matching APK from this exact build and source; APK SHA256 `2e0a05f8b1b9f16fb5b2b3a5d13911b06c412c995de8ed1106a8c6e592d2d7b5`; signing certificate unchanged. APK size 17,634,926 bytes.
- Download after Pages deployment: `https://www.cuberoot-systems.com/downloads/spendrecorder.apk?build=38333150238`. Live domain HTTP was not independently fetched from this runtime. **Fire HD 8 acceptance remains PENDING**: install over existing app without uninstall, verify existing SQLite data, test camera/gallery receipt after save/restart, and physically verify CSV and XLSX appear/open in Downloads. Do not claim device PASS from source and CI alone.
