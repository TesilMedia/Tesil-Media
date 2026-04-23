#!/bin/bash
cd "$(dirname "$0")/.."
set -a
source .env
set +a
node scripts/media-server.mjs
