#!/bin/sh
# 백업 복구 테스트: 임시 DB(restore_test)에 복구 → 행 수 출력 → 삭제. 운영 DB(sugo)는 건드리지 않는다.
# 사용: docker compose exec -T backup sh /restore-test.sh [sugo-YYYYmmdd-HHMMSS.dump]
set -eu
FILE="${1:-}"
if [ -z "${FILE}" ]; then
  FILE="$(ls -1t /backups/sugo-*.dump 2>/dev/null | head -n 1 | xargs -n1 basename 2>/dev/null || true)"
fi
case "${FILE}" in
  sugo-[0-9]*-[0-9]*.dump) ;;
  *) echo "백업 파일이 없거나 이름이 이상합니다: '${FILE}'" >&2; exit 1 ;;
esac
echo "복구 테스트: ${FILE}"
dropdb --if-exists restore_test
createdb restore_test
pg_restore --no-owner --exit-on-error -d restore_test "/backups/${FILE}"
psql -d restore_test -At -c "select 'profiles=' || count(*) from profiles" \
  -c "select 'hangul_progress=' || count(*) from hangul_progress" \
  -c "select 'hangul_plays=' || count(*) from hangul_plays"
dropdb restore_test
echo "OK: 복구 테스트 성공"
