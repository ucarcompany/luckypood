# Lucky Pool 服务器部署脚本
# 用法: .\deploy-to-server.ps1

Write-Host "正在连接到服务器并更新代码..." -ForegroundColor Green

# SSH 连接服务器并执行更新命令
$commands = @"
cd /opt/luckypood
echo '拉取最新代码...'
git pull origin main

echo '安装后端依赖...'
cd backend
npm install

echo '构建后端...'
npm run build

echo '重启后端服务...'
pm2 restart ecosystem.config.js --update-env

echo '检查服务状态...'
pm2 status

echo '部署完成!'
"@

# 执行 SSH 命令
ssh root@instance-wh7145ru "bash -c '$commands'"

Write-Host "部署完成！" -ForegroundColor Green
