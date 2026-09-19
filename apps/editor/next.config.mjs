/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The hub embeds the tools in iframes, so this is an allowlist rather
          // than a flat DENY. apps/home carried no headers at all until
          // 2026-09-19: the one app that embeds the others was the only one
          // anybody could frame, and a 90-day session cookie means a victim is
          // almost always signed in.
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://techpaddock.io https://*.techpaddock.io",
          },
          // A response whose Content-Type is wrong is then never re-guessed as
          // something executable.
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Every app is behind a password and its paths name real things — a
          // bag, an entry, a draft. The origin may travel to a third party; the
          // path must not.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

// Strict-Transport-Security is deliberately absent: Vercel sets it on every
// custom domain, and a second copy from here would be a duplicate header with
// no owner. NOT verified against a live response — the agent proxy blocks
// techpaddock.io — so if HSTS is ever found missing, this is where to add it.

export default nextConfig;
