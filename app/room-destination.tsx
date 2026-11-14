'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function RoomDestination({ href, name, current, children, className }: {
  href: string; name: string; current?: boolean; children: ReactNode; className?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  return <>
    <Link href={href} className={className} aria-current={current ? 'page' : undefined} onNavigate={event => {
      if (!current && document.querySelector('[data-meeting-active="true"]')) {
        event.preventDefault();
        setConfirm(true);
      }
    }}>{children}</Link>
    <Dialog open={confirm} onOpenChange={setConfirm}>
      <DialogContent>
        <DialogHeader><DialogTitle>Switch to {name}?</DialogTitle>
          <DialogDescription>This will leave your current meeting. You can join the next meeting when ready.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <DialogClose render={<Button variant="outline" />}>Stay in room</DialogClose>
          <Button onClick={() => { setConfirm(false); router.push(href); }}>Switch room</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
