#!/bin/sh
# Starts the course on http://127.0.0.1:8765 (needs Python 3).
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 serve.py "$@"; else exec python serve.py "$@"; fi
