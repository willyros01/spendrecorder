## SpendRecorder Android — branch-local status (2026-10-15)

The `android` branch contains SpendRecorder **1.0.2**, a local-SQLite Fire OS/Capacitor app with permanent APK signing and native receipt Camera/Downloads adaptations. Signed Android build and Cuberoot APK publication are recorded as PASS in `build/ANDROID-PLAN.md`, including the subsequent targeted camera/export repair; **Fire HD 8 physical acceptance of those latest repairs remains unverified**. Keep iOS/TestFlight `main`, original `expense-ledger`, and user SQLite records unchanged. No builds without explicit owner authorization. 

---

# SpendRecorder

Record your own expenses on your phone — any currency, with totals in your home currency.
No account, no cloud: everything stays in a SQLite database on the phone.

Made from the Expense Ledger web app (willyros01/expense-ledger, build v13), which is now retired as a separate public app. Its historical documentation is
preserved under docs/ and on Cuberoot under SpendRecorder.

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

- Documentation consolidation: [docs/README.md](docs/README.md).
