#!/bin/sh
# Postgres 백업 (pg_dump custom 형식).
#   매일:      /backups/sugo-YYYYmmdd-HHMMSS.dump      최근 BACKUP_KEEP 개 보관 (하루 1개)
#   업데이트/복구 직전: /backups/sugo-pre-YYYYmmdd-HHMMSS.dump  최근 BACKUP_PRE_KEEP 개 보관
#
# 사용:
#   sh /backup.sh            # (컨테이너 기본) 스키마가 생길 때까지 기다린 뒤, 마지막 일일 백업이
#                            # BACKUP_INTERVAL_SECONDS 보다 오래됐을 때만 백업. 한 시간마다 확인.
#                            # → 컨테이너를 여러 번 다시 시작해도 하루에 1개만 생겨서 오래된 백업이 밀려나지 않는다.
#   sh /backup.sh once pre   # 지금 바로 한 번 (update.ps1 / restore.ps1 이 사용). 실패하면 exit 1
set -u
KEEP="${BACKUP_KEEP:-14}"
PRE_KEEP="${BACKUP_PRE_KEEP:-5}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
CHECK=3600
[ "${INTERVAL}" -lt "${CHECK}" ] && CHECK="${INTERVAL}"

dump() { # $1 = 파일 이름 앞부분 (sugo 또는 sugo-pre)
  out="/backups/$1-$(date +%Y%m%d-%H%M%S).dump"
  if pg_dump --format=custom --no-owner --file="${out}.partial"; then
    mv "${out}.partial" "${out}"
    echo "[backup] ok $(basename "${out}") $(wc -c < "${out}") bytes"
    return 0
  fi
  rm -f "${out}.partial"
  echo "[backup] FAILED $(basename "${out}")" >&2
  return 1
}

prune() { # $1 = glob, $2 = 보관 개수
  ls -1t /backups/$1 2>/dev/null | tail -n +"$(($2 + 1))" | while read -r old; do
    rm -f "${old}" && echo "[backup] removed old $(basename "${old}")"
  done
}

if [ "${1:-}" = "once" ]; then
  dump sugo-pre || exit 1
  prune 'sugo-pre-*.dump' "${PRE_KEEP}"
  exit 0
fi

# web 이 마이그레이션을 끝내기 전(테이블 없음)에는 백업하지 않는다
until psql -Atqc "select 1 from information_schema.tables where table_name = 'profiles'" 2>/dev/null | grep -q 1; do
  echo "[backup] waiting for schema"
  sleep 10
done

while true; do
  # 일일 백업 이름은 sugo-2YYY... (sugo-pre-* 와 구분)
  if [ -z "$(find /backups -maxdepth 1 -name 'sugo-2*.dump' -mmin -"$((INTERVAL / 60))" 2>/dev/null)" ]; then
    dump sugo && prune 'sugo-2*.dump' "${KEEP}"
  fi
  sleep "${CHECK}"
done
