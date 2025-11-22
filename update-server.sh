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

# 设置 npm 镜像 (加速国内下载)
npm config set registry https://registry.npmmirror.com

# 安装根目录依赖 (Workspaces)
echo ""
echo "📦 安装根目录依赖..."
npm install --legacy-peer-deps

# 安装后端依赖
echo ""
echo "📦 安装后端依赖..."
cd backend
npm install --legacy-peer-deps
# 构建后端
echo "🔨 构建后端..."
npm run build
cd ..

# 安装前端依赖并构建
echo ""
echo "📦 安装前端依赖..."
cd frontend
npm install --legacy-peer-deps
echo "🔨 构建前端..."
npm run build
cd ..

# 重启服务
echo ""
echo "🔄 重启后端服务..."
cd backend
pm2 restart ecosystem.config.js --update-env
cd ..

# 重载 Nginx
echo ""
echo "🔄 重载 Nginx..."
service nginx reload

echo "✅ 更新完成!"

# 重载 Nginx 配置
echo ""
echo "🔄 重载 Nginx..."
service nginx reload

# 显示状态
echo ""
echo "✅ 部署完成！服务状态："
pm2 status

echo ""
echo "=========================================="
echo "查看日志: pm2 logs"
echo "=========================================="
