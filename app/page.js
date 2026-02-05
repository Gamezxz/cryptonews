import Header from '../components/Header';
import NewsCard from '../components/NewsCard';
import Footer from '../components/Footer';
import { getNews } from '../src/fetcher.js';

export const dynamic = 'force-static';

export async function generateMetadata() {
  return {
    title: 'Crypto News Aggregator',
    description: 'Latest cryptocurrency news from top sources',
  };
}

async function getNewsData() {
  try {
    return await getNews('all', 100);
  } catch (error) {
    console.error('Error fetching news:', error);
    return [];
  }
}

export default async function HomePage() {
  const news = await getNewsData();
  const lastUpdated = new Date().toISOString();

  return (
    <>
      <Header currentCategory="all" />

      <main className="main-content">
        <div className="container">
          <div className="news-header">
            <h2>Latest News</h2>
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
              <p>No news found. Check back soon!</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
