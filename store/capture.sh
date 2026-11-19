#!/usr/bin/env bash
set -euo pipefail

UDID=$(xcrun simctl list devices available -j | node --input-type=module -e '
  import fs from "node:fs";
  const devices = Object.entries(JSON.parse(fs.readFileSync(0)).devices).filter(([key]) => key.includes(".iOS-")).reverse().flatMap(([, rows]) => rows);
  const names = process.env.DEVICE === "iPhone"
    ? ["iPhone 17 Pro", "iPhone 16 Pro"]
    : ["iPad Pro 13-inch (M5)", "iPad Pro 13-inch (M4)"];
  const device = names.map(name => devices.find(row => row.name === name)).find(Boolean);
  if (!device) throw Error("Required simulator is missing: " + names.join(", "));
  console.log(device.udid);
')
export UDID
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time '9:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState discharging --batteryLevel 100 || true
xcrun simctl ui "$UDID" appearance light
npm install --no-audit --no-fund
npx cap add ios
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination "id=$UDID" -derivedDataPath "$RUNNER_TEMP/sr-dd" CODE_SIGNING_ALLOWED=NO build -quiet
socket=$(lsof -aUc launchd_sim 2>/dev/null | awk '/webinspectord_sim.socket/ && !found {print $NF; found=1}')
if [[ "$socket" != /* ]]; then
  socket=$(lsof -aUc launchd_sim 2>/dev/null | sed -nE 's@.*(/private/tmp/com\.apple\.launchd[^ ]*/com\.apple\.webinspectord_sim\.socket).*@\1@p' | sed -n '1p')
fi
test -S "$socket"
mkdir -p "$RUNNER_TEMP/captures"
ios_webkit_debug_proxy -s "unix:$socket" -F > "$RUNNER_TEMP/iwdp.log" 2>&1 &
trap 'kill $! 2>/dev/null || true; cat "$RUNNER_TEMP/iwdp.log"' EXIT
node store/capture.mjs "$RUNNER_TEMP/sr-dd/Build/Products/Debug-iphonesimulator/App.app" "$RUNNER_TEMP/captures"
if [[ "$DEVICE" == iPhone ]]; then target='1206 2622'; else target='2064 2752'; fi
python3 -m pip install --quiet --break-system-packages pillow
python3 - "$RUNNER_TEMP/captures" $target <<'PY'
import pathlib, sys
from PIL import Image
files = sorted(pathlib.Path(sys.argv[1]).glob('*.png'))
if len(files) != 5:
    raise SystemExit(f'Expected five screenshot captures, found {len(files)}')
expected = tuple(map(int, sys.argv[2:4]))
for filename in files:
    with Image.open(filename) as image:
        if image.size != expected:
            raise SystemExit(f'{filename.name} has dimensions {image.size}, expected {expected}')
        rgb = image.convert('RGB')
    rgb.save(filename)
    print(filename.name, *expected)
PY
