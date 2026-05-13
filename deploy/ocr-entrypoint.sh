#!/bin/sh
set -e

# $CODEX_AUTH_JSON is the contents of a ChatGPT ~/.codex/auth.json (see ADR-008).
# Write it out before starting the app so codex can authenticate. Empty -> OCR stays
# disabled but the service still boots and /health reports codex: unauthenticated.
if [ -n "${CODEX_AUTH_JSON:-}" ]; then
  mkdir -p "${HOME:-/root}/.codex"
  printf '%s' "$CODEX_AUTH_JSON" > "${HOME:-/root}/.codex/auth.json"
  chmod 600 "${HOME:-/root}/.codex/auth.json"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
