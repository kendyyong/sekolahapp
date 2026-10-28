#!/usr/bin/env bash
# Membangun database templat uji lokal: stub Supabase + semua migrasi.
# Tes (supabase/tests/*.test.mjs) menyalin templat ini lalu memuat fixtures.sql.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="psql -v ON_ERROR_STOP=1 -q -h ${PGHOST:-/tmp/pg} -p ${PGPORT:-54329} -U postgres"
$PSQL -d postgres -c "drop database if exists sekolahapp_test with (force)" \
                  -c "drop database if exists sekolahapp_template with (force)" \
                  -c "create database sekolahapp_template"
$PSQL -d sekolahapp_template -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "== $f"; $PSQL -d sekolahapp_template -f "$f"; done
echo "OK"
