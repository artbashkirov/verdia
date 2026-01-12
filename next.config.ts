import type { NextConfig } from "next";

// Next.js автоматически загружает переменные из .env.local при старте сервера

const nextConfig: NextConfig = {
  /* config options here */
  // Optimize for Vercel deployment (only for production build)
  // output: 'standalone',
  
  // Отключаем некоторые оптимизации для стабильности с iCloud путями
  reactStrictMode: false,
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
