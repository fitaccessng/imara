#!/bin/sh
set -eu

if ! command -v python3 >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3
fi
exec python3 /home/hivepod/data/imara-storage/server.py
