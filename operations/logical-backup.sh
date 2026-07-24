#!/bin/sh
set -eu

: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGHOST:?PGHOST is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGUSER:?PGUSER is required}"
: "${WALG_LIBSODIUM_KEY:?WALG_LIBSODIUM_KEY is required}"
: "${WALG_S3_PREFIX:?WALG_S3_PREFIX is required}"

umask 077
timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
dump_path="/tmp/web-comic-library-${timestamp}.dump"
trap 'rm -f "$dump_path"' EXIT

pg_dump --compress=0 --file "$dump_path" --format custom
wal-g st put "$dump_path" "logical/${timestamp}.dump"
