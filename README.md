## Current iOS/web and Android boundary — 2026-10-15

SpendRecorder is the current personal expense/receipt tracker derived from `willyros01/expense-ledger` (historical app). `main` is the iOS/TestFlight and web source. Data is on-device **SQLite**, not Firebase; do not invent accounts or cloud synchronization. The original `expense-ledger` deployment instructions are historical and must not be treated as the current SpendRecorder migration.

Fire HD 8 Android/Capacitor work lives on existing branch `android` (version **1.0.2** in its release plan), with permanent APK signing, same-origin Cuberoot distribution and native Camera/Downloads adapter fixes. Android workflow/build PASS is not physical data/persistence/camera/export acceptance; review `android/build/ANDROID-PLAN.md` and do not merge platform code into `main` blindly.

Developer freeze: no code, App Store/TestFlight builds, database migration, APK update or key regeneration from documentation work. Preserve exportable local expenses, receipt bytes, device-signing identity and large-font accessibility. 

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

- Documentation consolidation: [docs/README.md](docs/README.md).
