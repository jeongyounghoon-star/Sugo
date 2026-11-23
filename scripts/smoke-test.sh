#!/usr/bin/env bash
# docker compose 로 띄운 Sugo 를 바깥에서 점검 (CI compose-smoke job 과 설치 후 점검에 사용)
# 사용: bash scripts/smoke-test.sh http://localhost:3000
set -euo pipefail
BASE="${1:-http://localhost:3000}"
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

# 1. health (DB 연결 포함)
curl -fsS "$BASE/api/health" | grep -q '"ok":true' || fail "health"
ok "health"

# 2. 보안 헤더
headers="$(curl -fsS -D - -o /dev/null "$BASE/")"
for h in "content-security-policy: default-src 'self'" "x-content-type-options: nosniff" "referrer-policy: no-referrer" \
         "frame-ancestors 'none'" "permissions-policy:"; do
  echo "$headers" | tr 'A-Z' 'a-z' | grep -qF "$(echo "$h" | tr 'A-Z' 'a-z')" || fail "header $h"
done
echo "$headers" | grep -qi '^x-powered-by' && fail "x-powered-by exposed"
ok "security headers"

# 3. 페이지
for p in / /hangul /hangul/world/1 /hangul/play/w1-s1 /parent /manifest.webmanifest /audio/hangul/v_a.mp3; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
  [ "$code" = "200" ] || fail "GET $p → $code"
done
# 없는 월드/잠긴 월드 스테이지는 not-found 화면 (부분 프리렌더라 상태코드는 200일 수 있음)
for p in /hangul/play/w3-s1 /hangul/world/9; do
  curl -s "$BASE$p" | grep -q 'NEXT_HTTP_ERROR_FALLBACK;404' || fail "GET $p is not a not-found page"
done
if curl -s "$BASE/hangul/world/1" | grep -q 'NEXT_HTTP_ERROR_FALLBACK;404'; then fail "world 1 rendered as not-found"; fi
ok "pages"

# 4. API: 프로필 만들기 → 진도 동기화 → 다시 읽기
profile="$(curl -fsS -X POST -H 'content-type: application/json' -d '{"nickname":"smoke","avatar":"porong"}' "$BASE/api/profiles")"
id="$(echo "$profile" | sed -E 's/.*"id":"([0-9a-f-]{36})".*/\1/')"
[ ${#id} -eq 36 ] || fail "create profile: $profile"
body='{"epoch":0,"plays":[{"id":"11111111-1111-4111-8111-111111111111","stageId":"w1-s1","correct":6,"total":6,"stars":3,"playedAt":1795400000000}],"progress":{"version":1,"stages":{"w1-s1":{"bestStars":3,"bestAccuracy":1,"plays":1}},"review":{},"session":{"index":1,"lastActive":1795400000000},"daily":{"date":"2026-11-23","seconds":60,"dismissed":false},"history":{"2026-11-23":60}}}'
curl -fsS -X PUT -H 'content-type: application/json' -d "$body" "$BASE/api/hangul/progress/$id" | grep -q '"bestStars":3' || fail "sync"
curl -fsS "$BASE/api/hangul/progress/$id" | grep -q '"w1-s1"' || fail "read back"
ok "profile + progress sync"

# 5. 보호: 잘못된 입력/외부 Host/외부 Origin/큰 요청/JSON 아닌 요청
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"nickname":"","avatar":"x"}' "$BASE/api/profiles")"
[ "$code" = "400" ] || fail "invalid input → $code"
code="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example.com' "$BASE/api/profiles")"
[ "$code" = "403" ] || fail "foreign host → $code"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://evil.example.com' -H 'content-type: application/json' -d '{}' "$BASE/api/profiles")"
[ "$code" = "403" ] || fail "foreign origin → $code"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: text/plain' -d '{}' "$BASE/api/profiles")"
[ "$code" = "415" ] || fail "text/plain → $code"
code="$(head -c 300000 /dev/zero | tr '\0' 'a' | curl -s -o /dev/null -w '%{http_code}' -X PUT -H 'content-type: application/json' --data-binary @- "$BASE/api/hangul/progress/$id")"
[ "$code" = "413" ] || fail "large body → $code"
err="$(curl -s -X PUT -H 'content-type: application/json' -d '{bad' "$BASE/api/hangul/progress/$id")"
echo "$err" | grep -qiE 'stack|sql|select|postgres' && fail "error leaks internals: $err"
ok "request guards"

# 6. 부모 PIN: 없으면 삭제 불가 → 만들기 → 틀린 PIN 거부 → 맞는 PIN으로 삭제
code="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H 'content-type: application/json' -d '{"pin":"1234"}' "$BASE/api/profiles/$id")"
[ "$code" = "409" ] || fail "delete without pin set → $code"
curl -fsS -X POST -H 'content-type: application/json' -d '{"newPin":"2468"}' "$BASE/api/parent/pin" >/dev/null || fail "set pin"
code="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H 'content-type: application/json' -d '{"pin":"0000"}' "$BASE/api/profiles/$id")"
[ "$code" = "403" ] || fail "wrong pin → $code"
code="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H 'content-type: application/json' -d '{"pin":"2468"}' "$BASE/api/profiles/$id")"
[ "$code" = "200" ] || fail "delete with pin → $code"
ok "parent pin"

# 7. 컨테이너 보안 설정 (docker 가 있는 곳에서만)
if command -v docker >/dev/null 2>&1 && docker compose ps >/dev/null 2>&1; then
  for svc in db backup; do
    n="$(docker inspect -f '{{len .HostConfig.PortBindings}}' "$(docker compose ps -q "$svc")")"
    [ "$n" = "0" ] || fail "$svc publishes ports to host"
  done
  for svc in web db backup; do
    cid="$(docker compose ps -q "$svc")"
    user="$(docker inspect -f '{{.Config.User}}' "$cid")"
    ro="$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$cid")"
    nnp="$(docker inspect -f '{{json .HostConfig.SecurityOpt}}' "$cid")"
    caps="$(docker inspect -f '{{json .HostConfig.CapDrop}}' "$cid")"
    run_uid="$(docker compose exec -T "$svc" id -u)"
    [ "$run_uid" != "0" ] || fail "$svc runs as root"
    [ "$ro" = "true" ] || fail "$svc rootfs not read-only"
    echo "$nnp" | grep -q 'no-new-privileges' || fail "$svc no-new-privileges"
    echo "$caps" | grep -q 'ALL' || fail "$svc cap_drop"
    echo "  $svc: uid=$run_uid user=$user read_only=$ro"
  done
  # backend 네트워크는 internal (db 가 바깥으로 못 나감)
  net="$(docker network ls --filter name=sugo_backend -q)"
  [ "$(docker network inspect -f '{{.Internal}}' "$net")" = "true" ] || fail "backend network not internal"
  # 읽기 전용 파일시스템 때문에 생긴 오류가 없는지
  docker compose logs web 2>&1 | grep -q 'EROFS' && fail "web wrote to read-only fs"
  ok "container hardening"

  # 8. 백업 생성 + 복구 테스트
  for _ in $(seq 1 30); do
    docker compose exec -T backup sh -c 'ls /backups/sugo-*.dump' >/dev/null 2>&1 && break
    sleep 2
  done
  docker compose exec -T backup sh /restore-test.sh | tee /dev/stderr | grep -q 'OK:' || fail "restore test"
  ok "backup + restore"
fi

echo "ALL SMOKE TESTS PASSED"
