# Lucky Pool 服务器部署脚本
# 用法: .\deploy-to-server.ps1

Write-Host "正在连接到服务器并更新代码..." -ForegroundColor Green

# SSH 连接服务器并执行更新命令
$commands = @"
cd /opt/luckypood
echo '📥 拉取最新代码...'
git pull origin main

echo '🚀 执行更新脚本...'
chmod +x update-server.sh
./update-server.sh
"@

# 执行 SSH 命令
ssh root@38.22.95.235 "bash -c '$commands'"

Write-Host "部署完成！" -ForegroundColor Green
