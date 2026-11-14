import Link from 'next/link';
import { Header } from './shell';

export default function NotFound() {
  return <><Header /><main className="entry"><h1>Seite nicht verfügbar</h1>
    <p className="muted">Prüfen Sie die Adresse oder bitten Sie die Einsatzleitung um eine neue Einladung.</p>
    <Link href="/">Zur Leitstelle</Link>
  </main></>;
}
