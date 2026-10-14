#!/usr/bin/env bash
# Daily backup of the 实招 data directory: one tar.gz per run, newest $KEEP kept (default 7).
# Run as root from cron (see deploy/cron.example). The archive holds everything needed to
# restore — db.sqlite, session.key, uploads and pages — so it is as sensitive as the server:
# the backup directory is 700 and every archive 600.
#
#   sudo /opt/shizhao/deploy/backup.sh
#   BACKUP_DIR=/srv/backups KEEP=14 sudo -E /opt/shizhao/deploy/backup.sh
set -euo pipefail
umask 077

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-$DEPLOY_DIR/../data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/shizhao}"
KEEP="${KEEP:-7}"
COMPOSE=(docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" --project-directory "$DEPLOY_DIR")

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || { log "KEEP must be a positive integer"; exit 1; }
[[ -d "$DATA_DIR" ]] || { log "data directory not found: $DATA_DIR"; exit 1; }

install -d -m 700 "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" # also tightens a directory that already existed

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d "$BACKUP_DIR/.work-XXXXXX")"
trap 'rm -rf "$work"' EXIT

# A consistent database snapshot taken by the running app container (SQLite read transaction),
# instead of copying db.sqlite while it may be mid-write. The app must be running.
"${COMPOSE[@]}" exec -T shizhao node -e \
  "process.stdout.write(require('better-sqlite3')('/app/data/db.sqlite', { readonly: true }).serialize())" \
  >"$work/db.sqlite"
[[ -s "$work/db.sqlite" ]] || { log "database snapshot is empty"; exit 1; }

archive="$BACKUP_DIR/shizhao-$stamp.tar.gz"
# Live database files are replaced by the snapshot; temp files of half-finished uploads are skipped.
# Two steps so the excludes never apply to the snapshot (GNU and BSD tar differ on `./` matching).
tar -cf "$work/archive.tar" \
  -C "$DATA_DIR" \
  --exclude=./db.sqlite --exclude=./db.sqlite-wal --exclude=./db.sqlite-shm \
  --exclude='./tmp' \
  .
tar -rf "$work/archive.tar" -C "$work" db.sqlite
gzip -9 "$work/archive.tar"
# List first, then match: `tar | grep -q` under pipefail fails when grep exits early.
listing="$(tar -tzf "$work/archive.tar.gz")"
grep -qxE '(\./)?db\.sqlite' <<<"$listing" || { log "archive check failed: no db.sqlite"; exit 1; }
chmod 600 "$work/archive.tar.gz"
mv "$work/archive.tar.gz" "$archive"

# Keep the newest $KEEP archives (names sort by UTC timestamp).
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'shizhao-*.tar.gz' | sort -r | tail -n +"$((KEEP + 1))" |
  while IFS= read -r old; do rm -f -- "$old"; done

log "backup written: $archive ($(du -h "$archive" | cut -f1)); kept newest $KEEP"
