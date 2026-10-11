import type { ReactNode } from 'react';

export const metadata = {
  title: 'ReplayLab',
  description: 'API Debugging, Regression Testing & Playback Platform',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
