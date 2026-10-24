# SpendRecorder — Android and iPhone simulator test record

This document records the **test-only** device-simulator runs. SpendRecorder stores its data in on-device SQLite; there is no Firebase project or Firebase emulator to exercise.

The simulator copies use temporary, disposable databases. No production signing keys, TestFlight upload, Cuberoot APK publication, user records, or application code changes are involved. The `main` branch and the retired `expense-ledger` repository are not changed.

## Run record

| Platform | Tested commit | GitHub run | Result | Screenshot and log record |
| --- | --- | --- | --- | --- |
| Android | `d353795` (test harness) | [Retry run 40048839263](https://github.com/willyros01/spendrecorder/actions/runs/40048839263) | IN PROGRESS | Pending |
| iPhone | `main` at `d6be863` (app); `2e7b438` (test harness) | [Run 40048383885](https://github.com/willyros01/spendrecorder/actions/runs/40048383885) | **PASS: 9/9** | [Full illustrated report with 17 simulator captures](https://github.com/willyros01/spendrecorder/blob/ci-logs/logs/device-ios/1-2e7b438/REPORT.md) |

The report is updated only after the matching run logs have been inspected. A green GitHub status alone does **not** establish a test pass. Screenshots and complete run reports are attached to each test run; the reports link the screen captures to named actions.

### iPhone — verified run

The simulator report and GitHub Actions result agree: all nine scenarios completed successfully against the native SQLite plugin. The evidence includes the real simulator's screen captures for Terms, New Expense, History, Edit, Undo, receipt persistence, manual PHP conversion, deletion, Summary, and export. Each image is embedded immediately after its step in the [illustrated report](https://github.com/willyros01/spendrecorder/blob/ci-logs/logs/device-ios/1-2e7b438/REPORT.md).

The receipt scenario verifies that an image fixture is committed and reloaded from SQLite; it is **not** proof that a real phone camera or gallery picker works. On iOS, CSV creation and the share sheet opened, but choosing a cloud file destination is **NOT TESTED**.

### Android — test-harness retry

[Initial run 40048383811](https://github.com/willyros01/spendrecorder/actions/runs/40048383811) failed **before any app tests** because the emulator runner launched its command with `sh` while the command requested Bash's `pipefail`. The native debug APK built and emulator booted. A one-line Bash invocation fix is being verified in [retry run 40048839263](https://github.com/willyros01/spendrecorder/actions/runs/40048839263). This initial infrastructure error is not an application-test failure or pass.

## Scenarios

1. First launch and Terms: acceptance must persist after the app restarts.
2. Add an expense in CAD, including an amount, vendor and category; verify the SQLite row.
3. Force-close and reopen the app, then verify that the same expense and settings remain.
4. Edit an expense, and verify SQLite reflects the new amount without duplicating the row.
5. Delete, undo, and verify the original record remains; subsequently confirm a deletion commits after the undo period.
6. Verify a test receipt image is saved transactionally and survives a second restart (without claiming the physical camera picker was tested).
7. Enter a PHP expense with a manual conversion rate during a simulated exchange-rate service outage; verify the exact saved conversion.
8. Let a second deletion pass its six-second Undo window and verify the database row is actually removed.
9. Verify Summary and the platform's CSV export: Android Downloads or iPhone's generated file and share sheet.

Excel export/import and physical gallery/camera selection are not exercised by this initial automated journey and must be marked **NOT TESTED** until covered by a later test or device check.

Each run must record PASS, FAIL, or NOT TESTED for each scenario, a platform-specific screenshot, and any relevant SQLite integrity check. A simulator pass is not equivalent to acceptance on a physical Fire HD 8 or iPhone.

## Coverage boundaries

- **Android:** debug-signed disposable emulator build from the `android` branch. Never submit this APK to the public publisher.
- **iPhone:** simulator-only build from a read-only checkout of `main`. Never upload it to TestFlight.
- **SQLite:** test data are confined to each simulator's app container; never uninstall a user's production app.
- **Receipt camera:** an emulator's gallery can exercise attachment persistence; a physical camera/gallery chooser must still be checked on the Fire tablet.
- **Network and currencies:** offline records are tested separately from the reliability of live exchange-rate providers.
- **Native file pickers:** the simulator cannot prove every vendor-specific file-manager experience. Physical-device confirmation remains mandatory.

## Required safety of the test harness

- Treat any failed test process or missing APK/app as a failed workflow (`set -o pipefail` where output uses `tee`).
- Save the full report and screenshots even on failure.
- Never use production secrets or upload a test APK.
- Record the exact source commit and GitHub Actions run URL.
