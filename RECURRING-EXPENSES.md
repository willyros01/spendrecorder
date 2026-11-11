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
