module.exports = {
  apps: [
    {
      name: "cryptonews",
      script: "src/index.js",
      node_args: "--max-old-space-size=256",
      max_memory_restart: "400M",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
    },
  ],
};
