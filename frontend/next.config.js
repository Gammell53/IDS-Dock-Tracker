/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    WEBSOCKET_URL: 'wss://idsdock.com/ws', // Use environment variable if needed
  },
};

module.exports = nextConfig;
