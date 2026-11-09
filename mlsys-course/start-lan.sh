#!/bin/sh
# Starts the course for this computer AND your phone/tablet on the same Wi-Fi (prints a private link).
cd "$(dirname "$0")" || exit 1
exec sh ./start.sh --lan "$@"
