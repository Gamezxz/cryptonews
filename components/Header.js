import Link from 'next/link';
import { categories } from '../config/sources.js';

export default function Header({ currentCategory = 'all' }) {
  return (
    <>
      <header className="site-header">
        <div className="container">
          <Link href="/" className="site-title">
            Crypto News
          </Link>
          <p className="site-subtitle">Aggregated from top sources</p>
        </div>
      </header>

      <nav className="category-nav">
        <div className="container">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={cat.id === 'all' ? '/' : `/categories/${cat.id}`}
              className={`nav-item ${currentCategory === cat.id ? 'active' : ''}`}
            >
              {cat.icon} {cat.name}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
