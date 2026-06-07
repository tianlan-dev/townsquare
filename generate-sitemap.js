const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "dist");
const siteUrl = process.env.SITE_URL || "http://localhost:3000";

if (!fs.existsSync(distDir)) {
  process.exit(0);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
  </url>
</urlset>
`;

fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemap);
