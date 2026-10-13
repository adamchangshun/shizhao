#!/bin/sh
# Container start: fix volume ownership, drop root, make sure there is an admin token,
# migrate the database, then run the Next.js server on 6688.
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  # A bind-mounted ./data is created by the Docker daemon as root on Linux hosts, and files
  # created by `docker compose exec` (root) end up inside it. Re-own only when something is not
  # owned by node, so a healthy volume is never walked or rewritten on start.
  if [ -n "$(find "$DATA_DIR" ! -user node -print -quit)" ]; then
    chown -R node:node "$DATA_DIR"
  fi
  exec setpriv --reuid=node --regid=node --init-groups -- "$0" "$@"
fi

if [ ! -w "$DATA_DIR" ]; then
  echo "[实招] 数据目录 $DATA_DIR 对用户 $(id -un) 不可写，请检查挂载的 ./data 权限" >&2
  exit 1
fi

if [ -z "${ADMIN_TOKEN:-}" ]; then
  token_file="$DATA_DIR/admin-token"
  if [ -L "$token_file" ] || { [ -e "$token_file" ] && [ ! -f "$token_file" ]; }; then
    echo "[实招] $token_file 不是普通文件，拒绝使用" >&2
    exit 1
  fi
  if [ ! -s "$token_file" ]; then
    # Written to a private temp file and renamed, so the token is never readable by others.
    tmp="$token_file.tmp.$$"
    (umask 077 && node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))" >"$tmp")
    mv -f "$tmp" "$token_file"
    echo "[实招] 未设置 ADMIN_TOKEN，已随机生成管理口令：$(cat "$token_file")"
    echo "[实招] 口令保存在 data/admin-token；也可以在 .env 中设置 ADMIN_TOKEN 覆盖"
  else
    chmod 600 "$token_file"
    echo "[实招] 使用 data/admin-token 中保存的管理口令"
  fi
  ADMIN_TOKEN="$(cat "$token_file")"
  export ADMIN_TOKEN
fi

node --import tsx lib/db/migrate-cli.ts
exec node_modules/.bin/next start --hostname 0.0.0.0 --port 6688
