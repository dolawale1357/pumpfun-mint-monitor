/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: "pumpfun-mint-monitor",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5_000,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
