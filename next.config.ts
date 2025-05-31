
import type {NextConfig} from 'next';

const NEXT_PUBLIC_SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'https://chat-g145.onrender.com';
const socketServerHostname = new URL(NEXT_PUBLIC_SOCKET_SERVER_URL).hostname;

const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com/firebasejs/ https://static.cloudflareinsights.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://unpkg.com;
    img-src 'self' data: https://placehold.co https://github.com https://storage.googleapis.com;
    font-src 'self' https://unpkg.com;
    connect-src 'self' ${NEXT_PUBLIC_SOCKET_SERVER_URL} wss://${socketServerHostname} *.google.com *.googleapis.com https://firebaseinstallations.googleapis.com https://firebaseremoteconfig.googleapis.com https://www.google-analytics.com https://ssl.google-analytics.com https://analytics.google.com;
    frame-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self' https://studio.firebase.google.com;
    frame-ancestors 'self' https://studio.firebase.google.com;
    upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();


const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_SOCKET_SERVER_URL: NEXT_PUBLIC_SOCKET_SERVER_URL,
  },
  async headers() {
    return [
      {
        source: '/(.*)', // Apply to all routes
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY', // Or 'SAMEORIGIN' if you need to frame your site
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: "camera=(self), microphone=(self), fullscreen=(self), display-capture=(self), autoplay=(self)",
          }
        ],
      },
    ];
  },
};

export default nextConfig;
