import Link from 'next/link';

export default function Header() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="site-title">
          Crypto News
        </Link>
        <p className="site-subtitle">Aggregated from top sources</p>
      </div>
    </header>
  );
}
