'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import Meeting from './meeting';

export default function IncidentStage({ path, enabled, board }: {
  path: string; enabled: boolean; board: ReactNode;
}) {
  const [view, setView] = useState<'people' | 'share' | 'board'>();
  const [sharing, setSharing] = useState(false);
  const selected = view ?? (sharing ? 'share' : 'people');

  return <section className="incidentStage" aria-label="Incident stage" data-view={selected}>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Stage view">
      <Button variant={selected === 'people' ? 'default' : 'outline'} aria-pressed={selected === 'people'}
        onClick={() => setView('people')}>People</Button>
      <Button variant={selected === 'share' ? 'default' : 'outline'} aria-pressed={selected === 'share'}
        onClick={() => setView('share')}>Shared screen</Button>
      <Button variant={selected === 'board' ? 'default' : 'outline'} aria-pressed={selected === 'board'}
        aria-controls="board-stage" onClick={() => setView('board')}>Whiteboard view</Button>
    </div>
    {sharing && <p className="muted" role="status">Screen sharing active</p>}
    <Meeting path={path} enabled={enabled} showShare={selected === 'share'} onShareChange={setSharing} />
    <div id="board-stage" hidden={selected !== 'board'}>{board}</div>
  </section>;
}
