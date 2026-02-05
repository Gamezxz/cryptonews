import Header from '../components/Header';
import NewsFeed from '../components/NewsFeed';
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
    return await getNews('all', 200);
  } catch (error) {
    console.error('Error fetching news:', error);
    return [];
  }
}

export default async function HomePage() {
  const news = await getNewsData();

  return (
    <>
      <Header />
      <NewsFeed news={JSON.parse(JSON.stringify(news))} />
      <Footer />
    </>
  );
}
