#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${1:?project root is required}"
MAX_SIZE_MB="${2:-20}"
KEEP_COUNT="${3:-14}"
shift 3

LOG_FILES=("$@")

if [ "${#LOG_FILES[@]}" -eq 0 ]; then
  LOG_FILES=(
    "worker.log"
    "worker.error.log"
    "alloy.log"
    "alloy.err.log"
  )
fi

LOG_DIR="$PROJECT_ROOT/logs"

if ! [[ "$MAX_SIZE_MB" =~ ^[0-9]+$ ]]; then
  echo "[rotate-logs] invalid MAX_SIZE_MB: $MAX_SIZE_MB" >&2
  exit 1
fi

if ! [[ "$KEEP_COUNT" =~ ^[0-9]+$ ]]; then
  echo "[rotate-logs] invalid KEEP_COUNT: $KEEP_COUNT" >&2
  exit 1
fi

MAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))

mkdir -p "$LOG_DIR"

rotate_file() {
  local file_name="$1"
  local file_path="$LOG_DIR/$file_name"

  if [ ! -f "$file_path" ]; then
    return 0
  fi

  local size
  size=$(wc -c < "$file_path")
  if [ "$size" -le "$MAX_SIZE_BYTES" ]; then
    return 0
  fi

  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"

  cp "$file_path" "${file_path}.${timestamp}"
  : > "$file_path"

  local backups=()
  shopt -s nullglob
  for candidate in "$LOG_DIR"/"${file_name}".*; do
    backups+=( "$candidate" )
  done
  shopt -u nullglob

  if [ "${#backups[@]}" -gt "$KEEP_COUNT" ]; then
    IFS=$'\n' backups_sorted=($(printf '%s\n' "${backups[@]}" | sort))
    local remove_count=$(( ${#backups_sorted[@]} - KEEP_COUNT ))
    for ((i = 0; i < remove_count; i++)); do
      rm -f "${backups_sorted[$i]}"
    done
  fi
}

for file_name in "${LOG_FILES[@]}"; do
  rotate_file "$file_name"
done
