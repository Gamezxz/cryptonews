import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { connectDB } from './db/connection.js';
import { NewsItem } from './db/models.js';
import { categories } from '../config/sources.js';
import config from '../config/default.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(process.cwd(), 'output');
const TEMPLATE_DIR = path.join(process.cwd(), 'templates');

// Ensure output directories exist
async function ensureOutputDir() {
  const dirs = [
    OUTPUT_DIR,
    path.join(OUTPUT_DIR, 'categories'),
    path.join(OUTPUT_DIR, 'assets', 'css'),
    path.join(OUTPUT_DIR, 'assets', 'js')
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Copy assets to output directory
async function copyAssets() {
  const cssSrc = path.join(TEMPLATE_DIR, 'assets', 'css', 'styles.css');
  const cssDest = path.join(OUTPUT_DIR, 'assets', 'css', 'styles.css');

  const jsSrc = path.join(TEMPLATE_DIR, 'assets', 'js', 'app.js');
  const jsDest = path.join(OUTPUT_DIR, 'assets', 'js', 'app.js');

  try {
    await fs.copyFile(cssSrc, cssDest);
    await fs.copyFile(jsSrc, jsDest);
    console.log('Assets copied successfully');
  } catch (err) {
    console.error('Error copying assets:', err.message);
  }
}

// Render EJS template
async function renderTemplate(templateName, data) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  const template = await fs.readFile(templatePath, 'utf-8');
  return ejs.render(template, data);
}

// Get news by category from MongoDB
async function getNewsByCategory(categoryId, limit = 100) {
  await connectDB();

  const query = categoryId === 'all' ? {} : { category: categoryId };
  const items = await NewsItem.find(query)
    .sort({ pubDate: -1 })
    .limit(limit)
    .lean();

  return items;
}

// Generate static HTML pages
export async function generateSite() {
  await connectDB();
  await ensureOutputDir();
  await copyAssets();

  console.log('Generating static site...');

  const lastUpdated = new Date().toISOString();

  // Generate index page (all news)
  console.log('Generating index.html...');
  const allNews = await getNewsByCategory('all', 100);

  const indexHtml = await renderTemplate('index.html', {
    news: allNews,
    categories: categories,
    currentCategory: 'all',
    lastUpdated: lastUpdated
  });

  await fs.writeFile(path.join(OUTPUT_DIR, 'index.html'), indexHtml);

  // Generate category pages
  for (const cat of categories) {
    if (cat.id === 'all') continue;

    console.log(`Generating categories/${cat.id}.html...`);
    const categoryNews = await getNewsByCategory(cat.id, 100);

    const categoryHtml = await renderTemplate('category.html', {
      news: categoryNews,
      categories: categories,
      currentCategory: cat.id,
      categoryName: cat.name,
      lastUpdated: lastUpdated
    });

    await fs.writeFile(
      path.join(OUTPUT_DIR, 'categories', `${cat.id}.html`),
      categoryHtml
    );
  }

  console.log('Site generation complete!');
}

// Run generator when executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  generateSite()
    .then(() => {
      console.log('Generation complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Generation failed:', err);
      process.exit(1);
    });
}

export default { generateSite, getNewsByCategory };
