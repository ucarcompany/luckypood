#!/bin/bash
set -e

# Multi-domain deployment script
# Domains:
#  - User frontend: https://luckypood.com
#  - Admin frontend: https://admin.luckypood.com
#  - Backend API & Socket.io: https://api.luckypood.com

REPO_DIR="/opt/luckypood"
USER_DIST="/var/www/luckypood-user"
ADMIN_DIST="/var/www/luckypood-admin"
BACKEND_NAME="lucky-backend"

echo "=== LuckyPool Multi-domain Deploy ==="
cd "$REPO_DIR"

echo "[1/8] Pull latest code"; git pull origin main

echo "[2/8] Install root workspace deps"; npm install --legacy-peer-deps

echo "[3/8] Build backend"; npm run -w backend build

echo "[4/8] Build user frontend"; npm run -w frontend build

echo "[5/8] Build admin frontend"; npm run -w admin build || true

echo "[6/8] Sync user dist"; sudo mkdir -p "$USER_DIST"; sudo rsync -a --delete frontend/dist/ "$USER_DIST"/
echo "[7/8] Sync admin dist"; sudo mkdir -p "$ADMIN_DIST"; sudo rsync -a --delete admin/dist/ "$ADMIN_DIST"/

echo "[8/8] Start/Reload backend PM2"
if pm2 describe "$BACKEND_NAME" >/dev/null 2>&1; then
  pm2 restart "$BACKEND_NAME" --update-env
else
  pm2 start "$REPO_DIR/backend/dist/index.js" --name "$BACKEND_NAME"
fi
pm2 save

echo "Reloading Nginx"; sudo nginx -t && sudo systemctl reload nginx

echo "Deployment finished."; pm2 status "$BACKEND_NAME"

echo "Tip: Ensure env files on server (backend/.env, contracts/.env) set BASE_URL=https://api.luckypood.com"