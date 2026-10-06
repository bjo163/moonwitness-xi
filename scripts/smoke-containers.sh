#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker-compose.production.yml -f docker-compose.smoke.yml)
phase=compose_up
export COMPOSE_PROJECT_NAME="moonwitness-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-$$}"
export DATABASE_URL='postgresql://postgres:postgres@postgres:5432/moonwitness_smoke'
export JWT_SECRET='ci-only-secret-that-is-at-least-32-characters-long'
export SUPERADMIN_PASSWORD='ci-smoke-superadmin-password'
export API_PORT=3000

cleanup() {
  local exit_code=$?
  local cleanup_status=0
  if (( exit_code != 0 )); then
    printf '::error title=Container smoke failed::Phase %s failed; inspect the authorized runner log for details.\n' "$phase"
  fi
  trap - EXIT
  phase=cleanup
  "${compose[@]}" down --volumes --remove-orphans || cleanup_status=$?
  if (( cleanup_status != 0 )); then
    printf '::error title=Container smoke failed::Phase cleanup failed; inspect the authorized runner log for details.\n'
    if (( exit_code == 0 )); then
      exit_code=$cleanup_status
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT

phase=compose_up
if [[ "${SMOKE_USE_PREBUILT_IMAGES:-false}" == "true" ]]; then
  "${compose[@]}" up --detach --no-build --wait --wait-timeout 180 api board
else
  "${compose[@]}" up --detach --build --wait --wait-timeout 180 api board
fi

phase=api_root
api_info="$(curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/)"
phase=api_banner
grep -q 'MoonWitness Enterprise ORM API' <<< "$api_info"
phase=api_readiness
curl --fail --silent --show-error http://127.0.0.1:3000/readyz | grep -q '"status":"healthy"'
phase=board_root
curl --fail --silent --show-error http://127.0.0.1:4174/ | grep -q 'MoonWitness'

phase=api_stop
"${compose[@]}" stop --timeout 45 api
phase=graceful_shutdown
"${compose[@]}" logs api | grep -Eq 'Graceful shutdown complete|API server shutdown complete'
