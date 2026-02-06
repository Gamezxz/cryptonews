import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata = {
  title: 'NEXUS // Crypto Intelligence Feed',
  description: 'Real-time cryptocurrency news aggregation from 22+ sources',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${jetbrains.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
