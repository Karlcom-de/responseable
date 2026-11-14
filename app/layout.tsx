import type { Metadata } from 'next';
import './style.css';
import { ThemeProvider } from './theme';

export const metadata: Metadata = {
  title: 'ResponseAble | Incident response rooms',
  description: 'Self-hosted, open-source incident rooms for IT operations, security and continuity. Invite responders and coordinate on a shared whiteboard.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>{children}</ThemeProvider></body></html>;
}
