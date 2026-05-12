import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NIU · Visitor Entry Management System',
  description: 'Noida International University - Visitor registration and management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
