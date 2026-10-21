import icon192 from "../manifest-192.png";
import icon512 from "../manifest-512.png";

// The web app manifest, for Chrome's install. A route rather than Next's
// app/manifest.ts: that convention writes its own <link rel="manifest"> with
// no crossorigin outside Vercel previews, so the browser fetches it without
// the session cookie and the gate (proxy.ts) answers with the login redirect.
// layout.tsx links this one with crossOrigin="use-credentials" instead. The
// icons are static imports, served from /_next/static, which the gate admits.
export function GET() {
  return Response.json(
    {
      name: "Lando",
      short_name: "Lando",
      description: "A puppy journal: potty, meals, treats, training and growth.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      // mcl39 paper (light) and bar, copied from lib/theme.css.
      background_color: "#f5f5f6",
      theme_color: "#121316",
      icons: [
        { src: icon192.src, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon512.src, sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
