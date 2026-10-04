#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker-compose.production.yml -f docker-compose.smoke.yml)
export COMPOSE_PROJECT_NAME="moonwitness-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-$$}"
export DATABASE_URL='postgresql://postgres:postgres@postgres:5432/moonwitness_smoke'
export JWT_SECRET='ci-only-secret-that-is-at-least-32-characters-long'
export SUPERADMIN_PASSWORD='ci-smoke-superadmin-password'
export API_PORT=3000

cleanup() {
  "${compose[@]}" down --volumes --remove-orphans
}
trap cleanup EXIT

"${compose[@]}" up --detach --build --wait --wait-timeout 180 api board

api_info="$(curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/)"
grep -q 'MoonWitness Enterprise ORM API' <<< "$api_info"
curl --fail --silent --show-error http://127.0.0.1:3000/readyz | grep -q '"status":"healthy"'
curl --fail --silent --show-error http://127.0.0.1:4174/ | grep -q 'MoonWitness'

"${compose[@]}" stop --timeout 45 api
"${compose[@]}" logs api | grep -Eq 'Graceful shutdown complete|API server shutdown complete'
