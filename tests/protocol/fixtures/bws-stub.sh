#!/usr/bin/env bash
# Stub bws binary used by the protocol E2E tests. NOT a mock — it's a
# real executable that the real MCP server spawns through the real
# subprocess machinery. It just happens to emit canned JSON instead of
# calling the BSM API.
#
# Behavior is controlled by BWS_STUB_MODE:
#   ok       — return happy-path JSON for every subcommand
#   missing  — return "Missing access token" to stderr, exit 1
#
# Default is "ok".

set -euo pipefail

MODE="${BWS_STUB_MODE:-ok}"

if [[ "$MODE" == "missing" ]]; then
  cat >&2 <<EOF
Error:
   0: Missing access token

Location:
   crates/bws/src/main.rs:66
EOF
  exit 1
fi

# Handle --version at top level.
if [[ "${1:-}" == "--version" ]]; then
  echo "bws 99.99.99-stub"
  exit 0
fi

subcmd="${1:-}"
action="${2:-}"

project_json='{"object":"project","id":"proj-stub-1","organizationId":"org-stub","name":"stub-project","creationDate":"2026-01-01T00:00:00Z","revisionDate":"2026-01-01T00:00:00Z"}'

secret_json='{"object":"secret","id":"sec-stub-1","organizationId":"org-stub","projectId":"proj-stub-1","key":"STUB_KEY","value":"stub-value","note":"stub-note","creationDate":"2026-01-01T00:00:00Z","revisionDate":"2026-01-01T00:00:00Z"}'

case "$subcmd" in
  project)
    case "$action" in
      list)    echo "[$project_json]" ;;
      get)     echo "$project_json" ;;
      create)  echo "$project_json" ;;
      edit)    echo "$project_json" ;;
      delete)  echo "$project_json" ;;
      *)       echo "unknown project action: $action" >&2; exit 2 ;;
    esac
    ;;
  secret)
    case "$action" in
      list)    echo "[$secret_json]" ;;
      get)     echo "$secret_json" ;;
      create)  echo "$secret_json" ;;
      edit)    echo "$secret_json" ;;
      delete)  echo "$secret_json" ;;
      *)       echo "unknown secret action: $action" >&2; exit 2 ;;
    esac
    ;;
  run)
    # Strip everything up to `--` and run the tail in a real sh.
    shift
    found_sep=0
    tail=()
    for a in "$@"; do
      if [[ $found_sep -eq 1 ]]; then
        tail+=("$a")
      elif [[ "$a" == "--" ]]; then
        found_sep=1
      fi
    done
    if [[ $found_sep -eq 1 && ${#tail[@]} -gt 0 ]]; then
      STUB_INJECTED=1 "${tail[@]}"
    else
      echo "run requires a command after --" >&2
      exit 2
    fi
    ;;
  *)
    echo "unknown subcommand: $subcmd" >&2
    exit 2
    ;;
esac
