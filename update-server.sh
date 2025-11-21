#!/bin/bash

# Lucky Pool 服务器更新脚本
# 直接在服务器上运行此脚本

echo "=========================================="
echo "Lucky Pool 游戏服务器更新"
echo "=========================================="
echo ""

# 进入项目目录
cd /opt/luckypood || exit 1

# 拉取最新代码
echo "📥 拉取最新代码..."
git pull origin main

# 安装根目录依赖 (Workspaces)
echo ""
echo "📦 安装根目录依赖..."
npm install

# 安装后端依赖 (确保万无一失)
echo ""
echo "📦 安装后端依赖..."
cd backend
npm install

# 构建后端
echo ""
echo "🔨 构建后端..."
npm run build

# 重启服务
echo ""
echo "🔄 重启后端服务..."
pm2 restart ecosystem.config.js --update-env

# 显示状态
echo ""
echo "✅ 部署完成！服务状态："
pm2 status

echo ""
echo "=========================================="
echo "查看日志: pm2 logs"
echo "=========================================="
