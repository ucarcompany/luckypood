// PM2 ecosystem configuration for Lucky-pool backend
// 用统一文件管理环境变量，避免旧的进程缓存 BASE_URL 导致 .env 修改不生效。
module.exports = {
  apps: [
    {
      name: 'lucky-backend', // 统一进程名，避免与旧名混淆
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        PORT: 4000,
        BASE_URL: 'https://api.luckypood.com', // 部署后端对外完整 HTTPS 域名
        UPLOAD_DIR: 'uploads',
        METADATA_DIR: 'metadata'
        // 如需开启 API_KEY 保护：API_KEY: 'your-strong-api-key'
      }
    }
  ]
};
