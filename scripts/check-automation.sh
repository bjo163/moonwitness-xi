#!/usr/bin/env bash
set -euo pipefail

container_root=$PWD
if command -v cygpath >/dev/null 2>&1; then
  container_root=$(cygpath -m "$PWD")
fi

run_in_repo_container() {
  MSYS_NO_PATHCONV=1 docker run --rm -v "$container_root:/work" -w /work "$@"
}

run_in_repo_container rhysd/actionlint:1.7.12 -color .github/workflows/*.yml
bash -n scripts/*.sh
run_in_repo_container koalaman/shellcheck:v0.11.0 -s bash scripts/*.sh

if output=$(run_in_repo_container rhysd/actionlint:1.7.12 scripts/fixtures/invalid-workflow.yml.fixture 2>&1); then
  printf '%s\n' 'Actionlint accepted the invalid YAML fixture.' >&2
  exit 1
fi

case "$output" in
  *scripts/fixtures/invalid-workflow.yml.fixture*) printf '%s\n' 'Actionlint correctly rejected the invalid YAML fixture.' ;;
  *) printf '%s\n' "$output" >&2; exit 1 ;;
esac

if output=$(run_in_repo_container koalaman/shellcheck:v0.11.0 -s bash scripts/fixtures/unsafe-shell.sh 2>&1); then
  printf '%s\n' 'ShellCheck accepted the unsafe fixture.' >&2
  exit 1
fi

case "$output" in
  *SC2086*) printf '%s\n' 'ShellCheck correctly rejected the unsafe expansion fixture.' ;;
  *) printf '%s\n' "$output" >&2; exit 1 ;;
esac

