# SpendRecorder

Record your own expenses on your phone — any currency, with totals in your home currency.
No account, no cloud: everything stays in a SQLite database on the phone.

Made from the Expense Ledger web app (willyros01/expense-ledger, build v13), which stays
unchanged in its own repo.

- The app: www/ (source of the screens: src/app.jsx — see build/web/BUILD-WEB.md)
- iOS build: GitHub Actions runs build/ios-build.sh and uploads to TestFlight
- Setup steps: HANDOVER.md · history: NOTES.txt · App Store text: STORE-LISTING.md
- Public pages: privacy.html, terms.html

## Android APK (branch: `android`)

This branch is an isolated Android build from the same SpendRecorder `www/` app.
The original Expense Ledger repository and SpendRecorder iOS `main` remain unchanged.

- Build and tests: `.github/workflows/android-apk.yml`, `build/android-build.sh`
- Permanent signing setup (once): `build/srasig.sh`
- Build report: `build/android-last-run.json`
- Automatic verified APK publisher: `willyros01/Cuberoot/main` (separate workflow)
- Website download when signed and published: https://www.cuberoot-systems.com/downloads/spendrecorder.apk
- Full process, secrets and Fire tablet acceptance: `build/ANDROID-PLAN.md`

Android keeps expenses/receipts in local on-device SQLite, not Firebase.
