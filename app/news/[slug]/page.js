import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import ArticleDetail from '../../../components/ArticleDetail';
import { connectDB } from '../../../src/db/connection.js';
import { NewsItem } from '../../../src/db/models.js';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  await connectDB();

  const items = await NewsItem.find({ slug: { $exists: true, $ne: null } })
    .sort({ pubDate: -1 })
    .limit(1000)
    .select('slug')
    .lean();

  return items.map(item => ({
    slug: item.slug
  }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  await connectDB();

  const item = await NewsItem.findOne({ slug }).lean();
  if (!item) {
    return { title: 'Article Not Found' };
  }

  return {
    title: `${item.translatedTitle || item.title} | Cryptonews`,
    description: item.aiSummaryThai || item.translatedContent || item.content?.substring(0, 160) || ''
  };
}

async function getArticleData(slug) {
  await connectDB();

  const article = await NewsItem.findOne({ slug }).lean();
  if (!article) return { article: null, related: [] };

  // Get related articles (same category)
  const related = await NewsItem.find({
    _id: { $ne: article._id },
    categories: { $in: article.categories || [article.category] }
  })
    .sort({ pubDate: -1 })
    .limit(4)
    .select('title translatedTitle source pubDate slug category')
    .lean();

  return {
    article: JSON.parse(JSON.stringify(article)),
    related: JSON.parse(JSON.stringify(related))
  };
}

export default async function ArticlePage({ params }) {
  const { slug } = await params;
  const { article, related } = await getArticleData(slug);

  if (!article) {
    return (
      <>
        <Header />
        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#888' }}>
          <h1>Article Not Found</h1>
          <p>The article you are looking for does not exist.</p>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <ArticleDetail article={article} relatedArticles={related} />
      <Footer />
    </>
  );
}
