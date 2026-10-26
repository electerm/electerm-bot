// pm2 process config — `pm2 start ecosystem.config.cjs`
module.exports = {
  apps: [
    {
      name: 'electerm-bot',
      script: 'src/index.js',
      cwd: __dirname,
      // long-running scheduler: posts daily, scans replies on an interval
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 5000,
      time: true,
      out_file: './data/pm2-out.log',
      error_file: './data/pm2-err.log',
      env: {
        NODE_ENV: 'production',
        // must be set before node starts — dotenv can't reliably move a live process's TZ
        TZ: 'Asia/Shanghai'
      }
    }
  ]
}
