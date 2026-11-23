#!/bin/sh
# 매일 pg_dump (custom 형식) → /backups/sugo-YYYYmmdd-HHMMSS.dump, 최근 BACKUP_KEEP개만 보관.
# 컨테이너 시작 직후 한 번, 그 뒤 BACKUP_INTERVAL_SECONDS 마다.
set -u
KEEP="${BACKUP_KEEP:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

while true; do
  ts="$(date +%Y%m%d-%H%M%S)"
  out="/backups/sugo-${ts}.dump"
  if pg_dump --format=custom --no-owner --file="${out}.partial"; then
    mv "${out}.partial" "${out}"
    echo "[backup] ok $(basename "${out}") $(wc -c < "${out}") bytes"
  else
    rm -f "${out}.partial"
    echo "[backup] FAILED at ${ts}" >&2
  fi
  # 오래된 백업 정리 (최근 KEEP개 유지)
  ls -1t /backups/sugo-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f "${old}" && echo "[backup] removed old $(basename "${old}")"
  done
  sleep "${INTERVAL}"
done
