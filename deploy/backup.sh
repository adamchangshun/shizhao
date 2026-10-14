#!/usr/bin/env bash
# Daily backup of the 实招 data directory: one tar.gz per run, newest $KEEP kept (default 7).
# Run as root from cron (see deploy/cron.example). The archive holds everything needed to
# restore — db.sqlite, session.key, uploads and pages — so it is as sensitive as the server:
# the backup directory is 700 and every archive 600.
#
# Consistency: the app container is paused (frozen, not stopped) while data/ is copied, so the
# database files and the uploaded/generated files all come from the same instant. SQLite treats
# such a copy like a power cut and recovers it from the WAL on open. Requests arriving during the
# copy wait and are served after it; the container is always resumed, even on failure.
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
paused=0
finish() {
  if ((paused)); then "${COMPOSE[@]}" unpause shizhao >/dev/null || log "WARNING: could not resume the app container"; fi
  rm -rf "$work"
}
trap finish EXIT

# Refuse to back up a stopped app: a paused-and-copied running app is the consistent case we test.
running="$("${COMPOSE[@]}" ps --status running --services)"
grep -qx shizhao <<<"$running" || { log "app container is not running"; exit 1; }

"${COMPOSE[@]}" pause shizhao >/dev/null
paused=1
# Half-finished upload temp files are skipped; everything else, database files included.
tar -czf "$work/archive.tar.gz" -C "$DATA_DIR" --exclude='./tmp' .
"${COMPOSE[@]}" unpause shizhao >/dev/null
paused=0

# List first, then match: `tar | grep -q` under pipefail fails when grep exits early.
listing="$(tar -tzf "$work/archive.tar.gz")"
grep -qxE '(\./)?db\.sqlite' <<<"$listing" || { log "archive check failed: no db.sqlite"; exit 1; }

archive="$BACKUP_DIR/shizhao-$stamp.tar.gz"
chmod 600 "$work/archive.tar.gz"
mv "$work/archive.tar.gz" "$archive"

# Keep the newest $KEEP archives (names sort by UTC timestamp).
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'shizhao-*.tar.gz' | sort -r | tail -n +"$((KEEP + 1))" |
  while IFS= read -r old; do rm -f -- "$old"; done

log "backup written: $archive ($(du -h "$archive" | cut -f1)); kept newest $KEEP"
