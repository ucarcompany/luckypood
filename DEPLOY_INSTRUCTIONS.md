# 服务器部署说明

## 🚀 快速部署（在服务器上执行）

**请直接在你的服务器终端中执行以下命令：**

```bash
# 1. 连接到服务器（使用服务器的实际 IP 地址）
# 例如: ssh root@your-server-ip

# 2. 进入项目目录
cd /opt/luckypood

# 3. 拉取最新代码
git pull origin main

# 4. 安装后端依赖
cd backend
npm install

# 5. 构建后端
npm run build

# 6. 重启服务
pm2 restart ecosystem.config.js --update-env

# 7. 查看服务状态
pm2 status

# 8. 查看日志（如果需要）
pm2 logs
```

## 更新内容

本次更新包括：
1. ✅ 修复了 socket.io 的类型定义问题
2. ✅ 实现了像素风格的游戏场景（类似你提供的图片）
3. ✅ 添加了移动端虚拟摇杆控制
4. ✅ 添加了触摸屏攻击按钮
5. ✅ 优化了角色、怪物、水池的像素艺术风格
6. ✅ 添加了树木、岩石、花朵等装饰元素
7. ✅ 改善了深度排序和相机跟随效果

## 前端部署

前端代码也已更新，如果使用 Vercel 或其他自动部署平台，会自动检测到新的提交并部署。

如果需要手动构建前端：

```bash
cd /opt/luckypood/frontend
npm install
npm run build
```

## 测试

部署完成后，访问你的应用程序：
- 在手机上测试虚拟摇杆控制
- 测试攻击按钮功能
- 验证像素艺术风格是否正确显示

## 故障排除

如果遇到问题：

1. 查看 PM2 日志：`pm2 logs`
2. 检查 Node 版本：`node -v`（建议 16+）
3. 清除缓存：`pm2 delete all && pm2 start ecosystem.config.js`
4. 检查端口占用：`netstat -tulpn | grep 4000`
