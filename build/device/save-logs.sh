#!/usr/bin/env bash
# Publish dummy-data screenshots and the self-contained illustrated run report.
# Only the separate ci-logs branch is written. No app/release files change.
set -Eeuo pipefail
KIND="$1"
SOURCE="${2:-out-device}"
test "$KIND" = android -o "$KIND" = ios
mkdir -p "$SOURCE"
test -f "$SOURCE/report.txt" || printf 'No test report: build or simulator setup failed before tests ran.\n' > "$SOURCE/report.txt"
test -f "$SOURCE/REPORT.md" || printf '# SpendRecorder %s — setup failure\n\nNo device tests completed. See build.log and run logs.\n' "$KIND" > "$SOURCE/REPORT.md"
GITDIR="$(mktemp -d)"
git fetch -q origin ci-logs:refs/remotes/origin/ci-logs
git worktree add -q --detach "$GITDIR" origin/ci-logs
RUN_DIR="logs/device-${KIND}/${GITHUB_RUN_NUMBER}-${GITHUB_SHA:0:7}"
mkdir -p "$GITDIR/$RUN_DIR"
cp -R "$SOURCE/." "$GITDIR/$RUN_DIR/"
git -C "$GITDIR" config user.name 'spendrecorder-device-ci'
git -C "$GITDIR" config user.email 'spendrecorder-device-ci@users.noreply.github.com'
git -C "$GITDIR" add "$RUN_DIR"
git -C "$GITDIR" commit -qm "device ${KIND} run ${GITHUB_RUN_NUMBER}"
git -C "$GITDIR" push -q origin HEAD:ci-logs
echo "Illustrated record: https://github.com/${GITHUB_REPOSITORY}/tree/ci-logs/${RUN_DIR}"
