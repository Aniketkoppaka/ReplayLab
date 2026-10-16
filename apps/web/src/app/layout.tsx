import type { ReactNode } from 'react';
import './globals.css';
import { AuthProvider } from '@/components/auth/auth-provider';
import { ProjectProvider } from '@/components/project/project-provider';

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
      <body className="min-h-screen bg-slate-950 font-sans antialiased text-slate-100">
        <AuthProvider>
          <ProjectProvider>{children}</ProjectProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
