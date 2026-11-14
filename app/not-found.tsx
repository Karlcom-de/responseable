import Link from 'next/link';
import { Header } from './shell';

export default function NotFound() {
  return <><Header /><main className="entry"><h1>Page unavailable</h1>
    <p className="muted">Check the address or ask the incident lead for a new invitation.</p>
    <Link href="/">Back to incident overview</Link>
  </main></>;
}
