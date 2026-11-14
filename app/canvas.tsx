'use client';

import { CaptureUpdateAction, Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useEffect, useRef, useState } from 'react';

declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string } }
if (typeof window !== 'undefined') window.EXCALIDRAW_ASSET_PATH = '/excalidraw/';

const supported = new Set(['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text', 'frame']);
const signature = (element: ExcalidrawElement) => `${element.version}:${element.versionNonce}:${element.isDeleted}`;

export default function Canvas({ path }: { path: string }) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI>();
  const [error, setError] = useState('');
  const known = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, ExcalidrawElement>());
  const ready = useRef(false);
  useEffect(() => {
    if (!api) return;
    let active = true;
    let running = false;
    let revision = -1;
    async function synchronize() {
      if (running) return;
      running = true;
      try {
        const batch: ExcalidrawElement[] = [];
        let size = 2;
        for (const element of pending.current.values()) {
          const bytes = new TextEncoder().encode(JSON.stringify(element)).length + 1;
          if (batch.length && (size + bytes > 250_000 || batch.length === 100)) break;
          batch.push(element);
          size += bytes;
        }
        if (batch.length) {
          const response = await fetch(path, { method: 'POST', body: JSON.stringify(batch) });
          if (!response.ok) throw Error();
          if (!active) return;
          for (const element of batch) {
            if (pending.current.get(element.id) === element) pending.current.delete(element.id);
          }
          revision = -1;
        }
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) throw Error();
        const remote: { elements: ExcalidrawElement[]; revision: number } = await response.json();
        if (!active) return;
        if (revision !== remote.revision) {
          revision = remote.revision;
          const elements = new Map(remote.elements.map(element => [element.id, element]));
          for (const element of pending.current.values()) {
            if (!elements.get(element.id)?.isDeleted) elements.set(element.id, element);
          }
          const scene = [...elements.values()];
          known.current = new Map(scene.map(element => [element.id, signature(element)]));
          api?.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
        }
        ready.current = true;
        setError('');
      } catch {
        if (active) setError('Could not sync the whiteboard.');
      } finally {
        running = false;
      }
    }
    void synchronize();
    const timer = setInterval(synchronize, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [api, path]);

  return <>
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="canvas" aria-label="Shared whiteboard">
      <Excalidraw langCode="en" theme="dark" excalidrawAPI={setApi}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false }, tools: { image: false } }}
        onChange={scene => {
          if (!ready.current) return;
          for (const element of scene) {
            if (!supported.has(element.type)) continue;
            const value = signature(element);
            if (known.current.get(element.id) !== value) {
              pending.current.set(element.id, element);
              known.current.set(element.id, value);
            }
          }
        }} />
    </div>
  </>;
}
