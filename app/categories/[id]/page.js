import Header from '../../../components/Header';
import NewsCard from '../../../components/NewsCard';
import Footer from '../../../components/Footer';
import { getNews } from '../../../src/fetcher.js';
import { categories } from '../../../config/sources.js';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return categories
    .filter(cat => cat.id !== 'all')
    .map((cat) => ({
      id: cat.id,
    }));
}

export async function generateMetadata({ params }) {
  const category = categories.find(cat => cat.id === params.id);
  return {
    title: `${category?.name || 'Category'} - Crypto News`,
    description: `Latest ${category?.name || ''} cryptocurrency news`,
  };
}

async function getCategoryNews(categoryId) {
  try {
    return await getNews(categoryId, 100);
  } catch (error) {
    console.error('Error fetching category news:', error);
    return [];
  }
}

export default async function CategoryPage({ params }) {
  const news = await getCategoryNews(params.id);
  const category = categories.find(cat => cat.id === params.id);
  const lastUpdated = new Date().toISOString();

  return (
    <>
      <Header currentCategory={params.id} />

      <main className="main-content">
        <div className="container">
          <div className="news-header">
            <h2>{category?.name} News</h2>
            <span className="last-updated">
              Updated: {new Date(lastUpdated).toLocaleString()}
            </span>
          </div>

          <div className="news-grid">
            {news.map((item, index) => (
              <NewsCard key={item.guid} item={item} index={index} />
            ))}
          </div>

          {news.length === 0 && (
            <div className="empty-state">
              <p>No {category?.name.toLowerCase()} news found. Check back soon!</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
