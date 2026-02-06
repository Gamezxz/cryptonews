import Link from 'next/link';

export default function Header() {
  return (
    <header className="site-header">
      <div className="container">
        <div className="header-inner">
          <Link href="/" className="header-brand">
            <div className="header-logo">N</div>
            <div className="header-text">
              <h1>NEXUS <span>//</span> FEED</h1>
              <p>Crypto Intelligence Aggregator</p>
            </div>
          </Link>
          <div className="header-status">
            <span className="status-dot"></span>
            <span>Live Feed Active</span>
          </div>
        </div>
      </div>
    </header>
  );
}
