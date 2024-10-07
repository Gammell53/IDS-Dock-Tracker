/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',  // Add this line
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/token',
        destination: `${apiUrl}/token`,
      },
      {
        source: '/sse',
        destination: `${apiUrl}/sse`,
      },
    ]
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  },
}

module.exports = nextConfig