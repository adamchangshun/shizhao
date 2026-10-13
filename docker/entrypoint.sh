#!/bin/sh
# Container start: fix volume ownership, drop root, make sure there is an admin token,
# migrate the database, then run the Next.js server on 6688.
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  # A bind-mounted ./data is created by the Docker daemon as root on Linux hosts.
  if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u node)" ]; then
    chown -R node:node "$DATA_DIR"
  fi
  exec setpriv --reuid=node --regid=node --init-groups -- "$0" "$@"
fi

if [ -z "${ADMIN_TOKEN:-}" ]; then
  token_file="$DATA_DIR/admin-token"
  if [ ! -s "$token_file" ]; then
    (umask 077 && node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))" >"$token_file")
    echo "[实招] 未设置 ADMIN_TOKEN，已随机生成管理口令：$(cat "$token_file")"
    echo "[实招] 口令保存在 data/admin-token；也可以在 .env 中设置 ADMIN_TOKEN 覆盖"
  else
    echo "[实招] 使用 data/admin-token 中保存的管理口令"
  fi
  ADMIN_TOKEN="$(cat "$token_file")"
  export ADMIN_TOKEN
fi

node --import tsx lib/db/migrate-cli.ts
exec node_modules/.bin/next start --hostname 0.0.0.0 --port 6688
