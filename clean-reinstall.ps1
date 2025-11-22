# Lucky Pool 服务器完全重装脚本
# 用法: .\clean-reinstall.ps1

Write-Host "正在连接到服务器并完全重装代码..." -ForegroundColor Green

# SSH 连接服务器并执行重装命令
$commands = @"
echo '🗑️ 删除旧代码...'
cd /opt
rm -rf luckypood

echo '📥 克隆新代码...'
git clone https://github.com/ucarcompany/luckypood.git
cd luckypood

echo '🚀 执行更新脚本...'
chmod +x update-server.sh
./update-server.sh
"@

# 执行 SSH 命令
ssh root@38.22.95.235 "bash -c '$commands'"

Write-Host "重装完成！" -ForegroundColor Green
