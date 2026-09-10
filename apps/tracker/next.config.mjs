/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
