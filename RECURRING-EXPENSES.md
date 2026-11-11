# SpendRecorder 1.1.0 — recurring expenses

Released implementation for iOS (`main`) and Android (`android`). User-authorized
2026-11-10. Shared recurrence engine comes from Expense Ledger build v19; native
storage and home-currency handling remain SpendRecorder-specific.

Tick Recurring expense below Comments on New or Edit. Daily, weekly, fortnightly,
monthly, quarterly, yearly and custom 1–999 days/weeks/months/years are supported.
Expenses post automatically on opening/resuming and while visible, including all
missed dates. No review or confirmation step. The latest occurrence controls the
future amount/date/frequency; older records remain unchanged. Editing an older
record is a correction to that record only. Turning recurring off on the latest
retains history. Removing the original removes the schedule. Receipt photos are
not copied forward.

Native SQLite adds an expense_metadata table with an expense foreign key and
ON DELETE CASCADE. Existing expenses/receipts are retained; no destructive table
replacement or database version reset. Metadata contains the single schedule,
latest ID, future defaults and links on occurrences. Store.update serializes the
fresh read, conditional plan and one executeSet transaction. A failed write
changes neither the occurrence nor its schedule. All native photo/export and
signing identities remain platform-specific and unchanged.

Each occurrence has a deterministic unique ID. Repeated resume events cannot
create duplicates. Date calculations retain original month-end/leap-day cadence.
Each occurrence uses the current home currency and a dated exchange-rate lookup
with existing offline fallback labelling. CSV/Excel exports and imports retain
recurring metadata and IDs. Existing backups without metadata still import as
ordinary expenses.

Validation: node --test tests/*.test.cjs uses real in-memory SQLite via node:sqlite
and the browser storage adapter. Tests cover old database/receipt preservation,
atomic rollback, duplicate concurrent posting, latest-template edits without past
amount/date changes, stopping and export/import metadata; date tests cover custom
intervals, month ends and leap years. Android native media/signing preflight also
runs. Browser UI QA and exact native build/publication results are recorded after
completion. Passing SQLite tests/builds does not constitute physical device
acceptance.

## Build results


  v1.1.0 (2026-11-10) — automatic recurring expenses on iOS and Android.
    Same behavior as Expense Ledger build v19: Daily/Custom frequency, automatic
    catch-up, latest-occurrence edits update one future template, older records
    remain unchanged. Additive SQLite metadata table; receipts preserved.
    20 date/storage checks PASS, including real SQLite rollback/upgrade tests.
    Browser New/Edit/History, latest template, persistence and stop PASS.
    iOS source 3c83758d66d8869544cb02ab0f1e7094b298e4d3: build/upload run
    42931991700 PASS; version 1.1.0 build 8 uploaded to Apple processing.
    Android source 9f6aa9558a504870a58837d480ed95b901d4ad42: signed run
    42931999334 PASS, artifact 13817655561; certificate unchanged. Cuberoot
    publisher 42932665361 PASS. APK SHA256
    5fbfec2b9daacadd5b48d410865a66425b48751b0f7918895a4ef4b07800c523.
    Website guide: /spendrecorder/guide/index.html (public, large text).
    Physical iPhone/Fire in-place update acceptance remains for the owner;
    build and database tests do not certify physical-device acceptance.
