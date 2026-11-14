import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Image from 'next/image';
import Link from 'next/link';
import { demo } from '../lib/store';
import { logout } from './actions';

export function Header({ name, guest = false }: { name?: string; guest?: boolean }) {
  const brand = <><Image className="mark" src="/icon.svg" alt="" width={32} height={32} unoptimized /> ResponseAble</>;
  return <header className="top">
    {guest ? <strong className="brand">{brand}</strong> : <Link className="brand" href="/">{brand}</Link>}
    <div className="identity">
      {demo && <Badge variant="outline">Übungsmodus</Badge>}
      {name && <><span>{name}</span><form action={logout}><Button type="submit" variant="ghost">Abmelden</Button></form></>}
    </div>
  </header>;
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <Alert role="alert" variant="destructive"><AlertDescription>{children}</AlertDescription></Alert>;
}
