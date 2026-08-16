import type { Metadata } from 'next';
import './globals.css';
import { Chrome } from './components/Chrome';

export const metadata: Metadata = {
  title: 'Clearhouse: a surety bond for agentic commerce',
  description:
    'The merchant posts the bond, we underwrite them before your agent pays, and we pay the buyer when our own score is wrong.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}
