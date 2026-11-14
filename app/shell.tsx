import Image from 'next/image';
import Link from 'next/link';
import { demo } from '../lib/store';
import { logout } from './actions';

export function Header({ name, guest = false }: { name?: string; guest?: boolean }) {
  const brand = <><Image className="mark" src="/icon.svg" alt="" width={32} height={32} unoptimized /> ResponseAble</>;
  return <header className="top">
    {guest ? <strong className="brand">{brand}</strong> : <Link className="brand" href="/">{brand}</Link>}
    <div className="identity">
      {demo && <span className="badge">Übungsmodus</span>}
      {name && <><span>{name}</span><form action={logout}><button className="quiet">Abmelden</button></form></>}
    </div>
  </header>;
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="notice" role="alert">{children}</p>;
}
