#!/bin/bash
# Runs the Migration 11 tests in a disposable PostgreSQL 17.11 container.
# No network, no published ports, data in memory, container removed afterwards.
# Usage, from the repository root: bash supabase/new-project/proposed-11-shipping/tests/run_tests.sh [output-file]
export MSYS_NO_PATHCONV=1
# pwd -W gives the Windows path under Git Bash; plain pwd is the fallback elsewhere
ROOT=$(cd "$(dirname "$0")/../.." && { pwd -W 2>/dev/null || pwd; })
C=ps11-disposable-test
OUT="${1:-test-output.txt}"
docker rm -fv $C >/dev/null 2>&1
docker run -d --name $C --network none --tmpfs /pgdata:rw,size=1g \
  -e PGDATA=/pgdata/d -e POSTGRES_USER=checker -e POSTGRES_DB=postgres -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$ROOT:/sql:ro" postgres:17.11 -c max_connections=200 -c log_min_messages=warning >/dev/null || exit 1
# The image starts a temporary server to initialise, then the real one: wait for the second
for i in $(seq 1 300); do
  [ "$(docker logs $C 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
  sleep 0.2
done
docker exec -e LC_ALL=C.UTF-8 $C bash /sql/proposed-11-shipping/tests/suite.sh > "$OUT" 2>&1
RC=$?
echo "suite exit: $RC" >> "$OUT"
docker inspect $C --format 'network={{.HostConfig.NetworkMode}} ports={{json .NetworkSettings.Ports}} image={{.Config.Image}}' >> "$OUT"
docker rm -fv $C >/dev/null 2>&1
echo "container left: $(docker ps -a --filter name=$C -q | wc -l)" >> "$OUT"
grep -E '  FAIL|^FAIL|pass [0-9]+, fail|suite exit|container left|STOP' "$OUT"
exit $RC
