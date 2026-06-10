import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.BUILD_MOBILE === 'true' ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: process.env.NEXT_PUBLIC_LOCAL_DB === 'true' ? 'http://backend:4000/api/:path*' : 'http://localhost:4000/api/:path*'
        }
      ];
    }
  })
};

export default nextConfig;
