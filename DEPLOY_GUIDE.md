# Lucky Pool 服务器部署指南

本指南将指导您如何将最新的代码部署到您的服务器 (`38.22.95.235`)。

## 1. 准备工作

确保您已经将本地的所有更改推送到 GitHub 仓库：
```bash
git add .
git commit -m "update: frontend ui and backend logic"
git push origin main
```

## 2. 连接服务器

打开终端（Terminal）或 PowerShell，使用 SSH 连接到服务器：
```bash
ssh root@38.22.95.235
```
*输入密码: `zTpctEKQ2KqsP2qX`*

## 3. 更新代码与构建 (热部署)

在服务器终端中，依次执行以下命令。您可以一行一行复制执行，也可以一次性复制执行。

### 第一步：进入项目目录并拉取最新代码
```bash
cd /opt/luckypood
git pull
```
*如果提示冲突，可以强制重置（慎用，会覆盖服务器上的修改）：* `git reset --hard origin/main && git pull`

### 第二步：安装依赖（如果有新增依赖）
```bash
npm install
```

### 第三步：构建后端
```bash
npm run -w backend build
```

### 第四步：构建前端（用户端）
```bash
npm run -w frontend build
```

### 第五步：构建管理端
```bash
npm run -w admin build
```

### 第六步：部署前端文件到 Nginx 目录
```bash
# 部署用户端
cp -r frontend/dist/* /var/www/luckypood-user/

# 部署管理端
cp -r admin/dist/* /var/www/luckypood-admin/
```

### 第七步：重启后端服务
```bash
pm2 restart lucky-backend
```

## 4. 验证部署

1. 打开浏览器访问您的网站。
2. 如果看不到变化，请尝试 **强制刷新** (Ctrl + F5 或 Cmd + Shift + R)，因为浏览器可能会缓存旧的 CSS/JS 文件。
3. 检查水波纹效果和聊天功能是否正常。

## 5. 常用命令速查

- 查看后端日志: `pm2 logs lucky-backend`
- 查看 Nginx 状态: `systemctl status nginx`
- 重启 Nginx: `systemctl restart nginx`
