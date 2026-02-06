import { writeFileSync } from 'fs';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { NewsItem } from '../src/db/models.js';

const SITE_URL = 'https://cryptonews.in.th';
const OUTPUT_PATH = 'output/sitemap.xml';

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toISODate(date) {
  return date ? new Date(date).toISOString().split('T')[0] : null;
}

async function generateSitemap() {
  console.log('Sitemap: Connecting to MongoDB...');
  await connectDB();

  const articles = await NewsItem.find({ slug: { $exists: true, $ne: null } })
    .sort({ pubDate: -1 })
    .select('slug pubDate updatedAt')
    .lean();

  console.log(`Sitemap: Found ${articles.length} articles`);

  const today = toISODate(new Date());

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

  for (const article of articles) {
    const lastmod = toISODate(article.updatedAt || article.pubDate);
    xml += `
  <url>
    <loc>${SITE_URL}/news/${escapeXml(article.slug)}/</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  xml += `
</urlset>
`;

  writeFileSync(OUTPUT_PATH, xml, 'utf-8');
  console.log(`Sitemap: Generated ${OUTPUT_PATH} (${articles.length + 1} URLs)`);

  await disconnectDB();
}

generateSitemap().catch(err => {
  console.error('Sitemap generation failed:', err);
  process.exit(1);
});
