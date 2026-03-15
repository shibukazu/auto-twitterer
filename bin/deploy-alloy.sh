#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALL_URL="http://127.0.0.1:3100/loki/api/v1/push"
LABEL="com.auto-twitterer.alloy"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
CONFIG="$PROJECT_ROOT/deploy/auto-twitterer.alloy"
LOKI_CONFIG_TEMPLATE="$PROJECT_ROOT/deploy/auto-twitterer.alloy.template"
LOGROTATE_LABEL="com.auto-twitterer.log-rotate"
LOGROTATE_TEMPLATE="$PROJECT_ROOT/deploy/com.auto-twitterer.log-rotate.plist.template"
LOGROTATE_PATH="$PROJECT_ROOT/deploy/com.auto-twitterer.log-rotate.plist"
ALLOY_STATE_DIR="$PROJECT_ROOT/.alloy"
ROTATE_INTERVAL=300
ROTATE_MAX_SIZE_MB=20
ROTATE_KEEP_COUNT=14
ROTATE_SCRIPT="$PROJECT_ROOT/bin/rotate-logs.sh"
HOSTNAME="$(scutil --get ComputerName 2>/dev/null || scutil --get LocalHostName 2>/dev/null || hostname)"
ALLOY_BIN="$(command -v alloy || true)"

mkdir -p "$ALLOY_STATE_DIR"

if [ -z "$ALLOY_BIN" ]; then
  echo "alloy が見つかりません。Homebrew でインストールしてください。 (brew install grafana/alloy/alloy)" >&2
  exit 1
fi

sed -e "s#__LOKI_URL__#${ALL_URL}#g" \
    -e "s#__HOSTNAME__#${HOSTNAME}#g" \
    -e "s#__PROJECT_ROOT__#${PROJECT_ROOT}#g" \
    "$LOKI_CONFIG_TEMPLATE" > "$CONFIG"

sed -e "s#__LABEL__#${LOGROTATE_LABEL}#g" \
  -e "s#__SCRIPT_PATH__#${ROTATE_SCRIPT}#g" \
  -e "s#__PROJECT_ROOT__#${PROJECT_ROOT}#g" \
  -e "s#__START_INTERVAL__#${ROTATE_INTERVAL}#g" \
  -e "s#__MAX_SIZE_MB__#${ROTATE_MAX_SIZE_MB}#g" \
  -e "s#__KEEP_COUNT__#${ROTATE_KEEP_COUNT}#g" \
  "$LOGROTATE_TEMPLATE" > "$LOGROTATE_PATH"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${ALLOY_BIN}</string>
    <string>run</string>
    <string>${CONFIG}</string>
    <string>--storage.path</string>
    <string>${ALLOY_STATE_DIR}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${PROJECT_ROOT}/logs/alloy.log</string>
  <key>StandardErrorPath</key>
  <string>${PROJECT_ROOT}/logs/alloy.err.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout gui/"$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap gui/"$(id -u)" "$PLIST"
launchctl kickstart -k gui/"$(id -u)"/${LABEL}

launchctl bootout gui/"$(id -u)" "$LOGROTATE_PATH" >/dev/null 2>&1 || true
launchctl bootstrap gui/"$(id -u)" "$LOGROTATE_PATH"
launchctl kickstart -k gui/"$(id -u)"/${LOGROTATE_LABEL}

printf "alloy config: %s\n" "$CONFIG"
printf "logrotate config: %s\n" "$LOGROTATE_PATH"
printf "logrotate plist: %s\n" "$LOGROTATE_PATH"
printf "launchctl plist: %s\n" "$PLIST"
printf "LOKI endpoint: %s\n" "$ALL_URL"
echo "auto-twitterer Alloy 設定を登録しました。"
