module.exports = {
  apps: [{
    name: 'mandara-talenta-frontend',
    script: 'serve.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
