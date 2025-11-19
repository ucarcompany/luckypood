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
        // 强制模块解析优先使用当前 backend 下的依赖，避免回落到上级 /opt/luckypood/node_modules
        NODE_PATH: __dirname + '/node_modules',
        // 将运行期数据目录迁移到仓库目录之外，避免 Git 工作区产生改动
        UPLOAD_DIR: '/opt/luckypood/data/uploads',
        METADATA_DIR: '/opt/luckypood/data/metadata',
        LOG_DIR: '/opt/luckypood/data/logs'
        // 如需开启 API_KEY 保护：API_KEY: 'your-strong-api-key'
      }
    }
  ]
};
