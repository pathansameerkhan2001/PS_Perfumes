#!/bin/bash
# Runs the API tests in disposable containers on an internal Docker network: no internet route, no
# published ports, data in memory, everything removed afterwards. Only api/, tests/, node_modules,
# the SQL files and src/services/payments.js are mounted, so .env is never visible. All
# credentials are fake.
# Usage, from the repository root: bash tests/api/run_api_tests.sh [output-file]
export MSYS_NO_PATHCONV=1
# pwd -W gives the Windows path under Git Bash; plain pwd is the fallback elsewhere
ROOT=$(cd "$(dirname "$0")/../.." && { pwd -W 2>/dev/null || pwd; })
NET=ps-api-test-net; DB=ps-api-test-db; REST=ps-api-test-rest; NODE=ps-api-test-node
JWT_SECRET=local-test-only-not-a-real-secret-0123456789
OUT="${1:-api-test-output.txt}"

cleanup(){ docker rm -fv $NODE $REST $DB >/dev/null 2>&1; docker network rm $NET >/dev/null 2>&1; }
cleanup
docker network create --internal $NET >/dev/null || exit 1

docker run -d --name $DB --network $NET --tmpfs /pgdata:rw,size=1g \
  -e PGDATA=/pgdata/d -e POSTGRES_USER=checker -e POSTGRES_DB=postgres -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$ROOT/supabase/new-project:/sql:ro" -v "$ROOT/tests/api/fixtures:/fx:ro" \
  postgres:17.11 -c max_connections=100 >/dev/null || { cleanup; exit 1; }
# The image starts a temporary server to initialise, then the real one: wait for the second
for i in $(seq 1 300); do
  [ "$(docker logs $DB 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
  sleep 0.2
done
docker exec $DB bash /fx/setup_db.sh > "$OUT" 2>&1 || { cat "$OUT"; cleanup; exit 1; }

docker run -d --name $REST --network $NET \
  -e PGRST_DB_URI="postgres://authenticator@$DB:5432/apitest" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_DB_CHANNEL_ENABLED=false \
  public.ecr.aws/supabase/postgrest:v16.4 >/dev/null || { cleanup; exit 1; }

docker run --rm --name $NODE --network $NET \
  -v "$ROOT/api:/app/api:ro" -v "$ROOT/tests:/app/tests:ro" -v "$ROOT/node_modules:/app/node_modules:ro" \
  -v "$ROOT/package.json:/app/package.json:ro" -v "$ROOT/supabase/new-project:/app/supabase/new-project:ro" \
  -v "$ROOT/src/services/payments.js:/app/src/services/payments.js:ro" \
  -e JWT_SECRET="$JWT_SECRET" -w /app node:24.12.0-alpine \
  node --test --test-reporter=spec tests/api/api.test.mjs >> "$OUT" 2>&1
RC=$?

echo "test exit: $RC" >> "$OUT"
docker network inspect $NET --format 'network internal={{.Internal}}' >> "$OUT"
docker inspect $DB $REST --format '{{.Name}} ports={{json .HostConfig.PortBindings}} image={{.Config.Image}}' >> "$OUT"
cleanup
echo "containers left: $(docker ps -a --filter name=ps-api-test -q | wc -l); networks left: $(docker network ls --filter name=$NET -q | wc -l)" >> "$OUT"
grep -E '^ℹ (tests|pass|fail|cancelled|skipped)|^✖ failing|test exit|left:' "$OUT"
exit $RC
