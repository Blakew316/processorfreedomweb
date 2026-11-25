#!/bin/bash
# PF Sites: put a branch from GitHub on an iPhone, hands free, from the Mac.
#
#   ios/tools/pf-phone.sh [branch] [phone name or UDID]
#
# Fetches the branch, copies its ios/ folder into a private build copy under ios/build/ (the checkout itself is never
# touched, so work in progress in it is safe), builds it, installs it on the phone and opens it. Only files that really
# changed are rewritten, so a second run compiles just those. A commit already on the phone is left alone.
#
# Without a branch it uses the repository's default branch. Without a phone it takes the one iPhone that is connected
# (by cable or on the same network, unlocked and trusted); with several connected, name the one you mean.
#
# Result: one line in /tmp/pf-phone.status, full output in /tmp/pf-phone.log.
# To run it in the background: (nohup ios/tools/pf-phone.sh >/dev/null 2>&1 &)
REPO="${PF_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
STATUS=/tmp/pf-phone.status
LOG=/tmp/pf-phone.log
LOCK=/tmp/pf-phone.lock

note() { echo "$(date '+%H:%M:%S') $*" > "$STATUS"; echo "== $(date '+%H:%M:%S') $*" >> "$LOG"; }

# One run at a time; a lock left behind by a crash expires after 30 minutes.
[ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ] && rmdir "$LOCK"
mkdir "$LOCK" 2>/dev/null || { echo "already running"; exit 0; }
trap 'rmdir "$LOCK"' EXIT
: > "$LOG"

cd "$REPO" || { note "FAILED: no checkout at $REPO"; exit 1; }

BRANCH="$1"
if [ -z "$BRANCH" ]; then
  BRANCH=$(git symbolic-ref -q --short refs/remotes/origin/HEAD | sed 's#^origin/##')
  [ -z "$BRANCH" ] && BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
  [ -z "$BRANCH" ] && { note "FAILED: no branch given and the default branch could not be worked out"; exit 1; }
fi

# The phone: the name or UDID given, or else the one real iPhone that is connected (simulators are not phones).
WANTED="$2"
DEVICES=$(mktemp /tmp/pf-phone-devices.XXXXXX)
xcrun devicectl list devices --json-output "$DEVICES" >> "$LOG" 2>&1
PHONE=$(/usr/bin/python3 - "$DEVICES" "$WANTED" <<'PY'
import json, re, sys
wanted = sys.argv[2].strip().lower()
try:
    devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    devices = []
found = []
for device in devices:
    hardware = device.get("hardwareProperties", {})
    udid = hardware.get("udid") or ""
    name = (device.get("deviceProperties", {}).get("name") or "")
    # A real phone's UDID is 8 and 16 hex digits; a simulator's is a UUID.
    if hardware.get("deviceType") != "iPhone" or not re.fullmatch(r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}", udid):
        continue
    if wanted:
        if wanted in (udid.lower(), name.lower()):
            found.append(udid)
    elif device.get("connectionProperties", {}).get("tunnelState") == "connected":
        found.append(udid)
print(found[0] if len(found) == 1 else ("MANY" if found else "NONE"))
PY
)
rm -f "$DEVICES"
case "$PHONE" in
  NONE) note "FAILED: no iPhone ${WANTED:+called \"$WANTED\" }is connected (plug it in, unlock it, and trust this Mac)"; exit 1 ;;
  MANY) note "FAILED: more than one iPhone is connected: give the name or UDID of the one you mean"; exit 1 ;;
esac

SLOT=$(echo "$BRANCH" | tr -c 'A-Za-z0-9._-' '-' | sed 's/-*$//')
WORK="$REPO/ios/build/work/phone-$SLOT"
DD="$REPO/ios/build/dd-phone-$SLOT"
APP="$DD/Build/Products/Debug-iphoneos/PFSites.app"

note "FETCHING $BRANCH"
git fetch -q origin "$BRANCH" >> "$LOG" 2>&1 || { note "FAILED: could not fetch $BRANCH"; exit 1; }
NEW=$(git rev-parse --short FETCH_HEAD)

if [ "$NEW" != "$(cat "$WORK/.commit" 2>/dev/null)" ]; then
  TMP=$(mktemp -d /tmp/pf-phone-src.XXXXXX)
  git archive FETCH_HEAD ios | tar -x -C "$TMP" --strip-components=1 || { note "FAILED: could not unpack $NEW"; rm -rf "$TMP"; exit 1; }
  mkdir -p "$WORK"
  rsync -rlpc --delete --exclude '.commit' --exclude '.built' --exclude '.installed-*' "$TMP/" "$WORK/" >> "$LOG" 2>&1
  rm -rf "$TMP"
  echo "$NEW" > "$WORK/.commit"
fi

if [ "$NEW" != "$(cat "$WORK/.built" 2>/dev/null)" ] || [ ! -d "$APP" ]; then
  note "BUILDING $NEW"
  if ! xcodebuild -project "$WORK/PFSites.xcodeproj" -scheme PFSites -configuration Debug \
       -destination 'generic/platform=iOS' -derivedDataPath "$DD" -allowProvisioningUpdates build >> "$LOG" 2>&1; then
    note "BUILD FAILED $NEW: $(grep -c ' error: ' "$LOG") errors"; exit 2
  fi
  echo "$NEW" > "$WORK/.built"
fi

if [ "$NEW" = "$(cat "$WORK/.installed-$PHONE" 2>/dev/null)" ]; then
  note "OK $NEW is already on the phone"; exit 0
fi
note "INSTALLING $NEW"
if ! xcrun devicectl device install app --device "$PHONE" "$APP" >> "$LOG" 2>&1; then
  note "NOT INSTALLED: $NEW is built, the phone did not take it (locked, asleep or off the network?)"; exit 3
fi
echo "$NEW" > "$WORK/.installed-$PHONE"
if xcrun devicectl device process launch --device "$PHONE" --terminate-existing com.processorfreedomsites.app >> "$LOG" 2>&1; then
  note "OK $NEW installed and opened"
else
  note "OK $NEW installed (phone locked, so not opened)"
fi
