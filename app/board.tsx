'use client';
import { Button } from '@/components/ui/button';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const Canvas = dynamic(() => import('./canvas'), { ssr: false, loading: () => <p>Loading whiteboard…</p> });

export default function Board({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  return <section className="roomForm">
    <h3>Whiteboard</h3>
    {open ? <Canvas path={path + '/board'} /> : <Button variant="outline" onClick={() => setOpen(true)}>Open whiteboard</Button>}
  </section>;
}
