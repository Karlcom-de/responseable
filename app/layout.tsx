import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = { title: 'ResponseAble', description: 'Digitale Einsatzleitstelle' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="de"><body>{children}</body></html>;
}
