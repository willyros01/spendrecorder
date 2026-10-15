## Documentation note — 2026-10-15

The setup instructions below are the **original iOS 1.0.0 migration handover**, preserved for reference rather than proof of current App Store/TestFlight approval. Current source remains `spendrecorder/main`; Android Fire migration is isolated to `spendrecorder/android`, and the old `expense-ledger/main` must remain separate. The Android 1.0.2 signing and native SQLite/camera/export details must not be applied to iOS without an owner-approved equivalent behavior change. The owner has frozen new builds, not documentation.

---

# SpendRecorder 1.0.0 — setup

SpendRecorder is the iOS app made from Expense Ledger build v13. It is built in the cloud by
GitHub Actions and delivered to TestFlight, exactly like Fairpot. No Xcode on any device.

- **willyros01/expense-ledger** (the web app) is never changed.
- **willyros01/spendrecorder** (this repo) holds the iOS app.

| Item | Value |
|---|---|
| App name | SpendRecorder |
| Bundle ID | io.github.willyros01.spendrecorder |
| Team ID | VXMLKHF72B |
| SKU (suggested) | spendrecorder |
| Contact | willyros01@gmail.com |

---

## Step 1 — GitHub Pages (the Safari test page and the privacy page)

Repo → Settings → Pages → Source: **Deploy from a branch** → Branch **main**, folder **/ (root)** → Save.

Test page: https://willyros01.github.io/spendrecorder/ · Privacy: https://willyros01.github.io/spendrecorder/privacy.html

The test page keeps its data under its own name (spendrecorder_db), so it never touches the
Expense Ledger web app's data, even though both live on willyros01.github.io.

## Step 2 — Apple: register the bundle ID

developer.apple.com → Account → Certificates, Identifiers & Profiles → Identifiers → **+** →
App IDs → App → Description **SpendRecorder**, Bundle ID **Explicit**: **io.github.willyros01.spendrecorder**.

## Step 3 — Apple: create the app in App Store Connect

appstoreconnect.apple.com → Apps → **+** → New App: iOS, name **SpendRecorder**,
English (Canada), the bundle ID above, SKU **spendrecorder**. Same account and seller
(Wilfredo Rosales) as Fairpot, The Scorecard and FIDUNIO.

## Step 4 — the four GitHub secrets

Same values as Fairpot (the App Store Connect Team API key can be reused).
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| ASC_KEY_ID | the Key ID |
| ASC_ISSUER_ID | the Issuer ID |
| ASC_KEY_P8 | the whole text of the .p8 file, including the BEGIN and END lines |
| APPLE_TEAM_ID | VXMLKHF72B |

GitHub never shows a secret again once saved, so they cannot be copied from the Fairpot repo.
If the .p8 file is no longer at hand, create a new Team key (Admin access) in App Store Connect →
Users and Access → Integrations → App Store Connect API, and use that.

Until all four exist, every build stops early with the notice "Build skipped" — nothing breaks.

## Step 5 — the build

Every push to main that changes www/, resources/, build/, package.json or
capacitor.config.json builds automatically (about 20–30 minutes, then 5–30 minutes of Apple
processing). After adding the secrets, the first build can be started from Actions →
**iOS build to TestFlight** → **Run workflow**, or by any small change to the app.

## Step 6 — TestFlight

App Store Connect → SpendRecorder → TestFlight → Internal Testing → add your Apple account →
install from the TestFlight app on the iPhone and iPad. Export compliance is already answered
in the build (no non-exempt encryption), as in Fairpot.

---

## If the build fails

| Message contains | Fix |
|---|---|
| runner label / "macos-26" not found | In the workflow, change runs-on to macos-15 |
| "No Account for Team" / not authorized / signing | API key must have Admin access; check APPLE_TEAM_ID |
| "No suitable application records were found" | Do step 3 with the exact bundle ID |
| "bundle version must be higher" | Run the workflow again |
| anything about CapacitorSQLite / packages | Send Claude the log |

---

## What to test on the phone (one pass)

1. Accept the terms. Add expenses in CAD, PHP and USD, one with a receipt photo. Swipe the app away, reopen — all there.
2. Check the rate line under Amount names its source (Frankfurter, today's rate, your own rate…). Tap it and type your own rate.
3. Edit an expense (the saved rate is kept); change its date (the rate is looked up again). Change its photo.
4. Delete one and tap Undo; delete another and let it go.
5. Summary: change the home currency to USD and back.
6. Export to Excel and save to Files; send a CSV by Mail.
7. Import your Expense Ledger Excel export (Summary → Import file).
8. Airplane Mode: add a PHP expense — it saves with the last known rate, clearly labelled.
9. iPad: the screens use the full width (two columns).
