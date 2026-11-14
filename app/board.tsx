'use client';
import { ExternalLink, PenTool } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const Canvas = dynamic(() => import('./canvas'), { ssr: false, loading: () => <p>Loading whiteboard…</p> });

export function RoomCanvas({ path }: { path: string }) {
  return <Canvas path={path + '/board'} />;
}

export default function Board({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  return <section className="roomForm">
    <h3 className="iconLabel"><PenTool className="navIcon" aria-hidden="true" />Whiteboard</h3>
    <div className="flex flex-wrap items-center gap-2">
      {!open && <Button variant="outline" onClick={() => setOpen(true)}>Open whiteboard</Button>}
      <a className={buttonVariants({ variant: 'outline' })} href={path + '/whiteboard'} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden="true" data-icon="inline-start" />Full-page whiteboard<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
    {open && <RoomCanvas path={path} />}
  </section>;
}
