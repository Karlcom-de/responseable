import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = {
  title: 'ResponseAble | Einsatzräume für Incident Response',
  description: 'Selbst gehostete Open-Source-Einsatzräume für IT-Betrieb, Security und Business Continuity. Beteiligte einladen und am gemeinsamen Lagebild koordinieren.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="de"><body>{children}</body></html>;
}
