'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export default function IncidentStage({ meeting, board }: { meeting: ReactNode; board: ReactNode }) {
  const [showBoard, setShowBoard] = useState(false);
  return <section className="incidentStage" aria-label="Incident stage" data-view={showBoard ? 'board' : 'meeting'}>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Stage view">
      <Button variant={showBoard ? 'outline' : 'default'} aria-pressed={!showBoard} onClick={() => setShowBoard(false)}>Meeting view</Button>
      <Button variant={showBoard ? 'default' : 'outline'} aria-pressed={showBoard} aria-controls="board-stage" onClick={() => setShowBoard(true)}>Whiteboard view</Button>
    </div>
    {meeting}
    <div id="board-stage" hidden={!showBoard}>{board}</div>
  </section>;
}
