# How www/app.js and www/lib were made

The app runs entirely from the files in www/ — nothing is downloaded from the internet
except exchange rates. The iOS build (build/ios-build.sh) uses www/ exactly as committed,
so the Safari test page and the iPhone app always run the same code.

| File | Made from | How |
|---|---|---|
| www/app.js | src/app.jsx | TypeScript compiler, JSX → plain JavaScript: `tsc -p build/web/tsconfig.json` |
| www/lib/react.bundle.js | build/web/vendor.js (React 19.2.8 + ReactDOM) | `bun build build/web/vendor.js --outfile www/lib/react.bundle.js --minify --target browser --format iife --define 'process.env.NODE_ENV="production"'` |
| www/lib/xlsx.full.min.js | SheetJS 0.18.5 (tag v0.18.5 of github.com/SheetJS/sheetjs, dist/) | copied as is — the same version the Expense Ledger web app loads |
| www/storage.js | — | hand-written, plain JavaScript (the SQLite layer) |

After any change to src/app.jsx, run the tsc command above and commit www/app.js too.
