'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import RoomChat from './room-chat';

type Credentials = { jid: string; password: string; roomJid: string; websocketUrl: string; nick: string; roomTitle?: string };
type Bootstrap = { assetsBase: string; credentials: Credentials };
type ConverseWindow = Window & { JSON: JSON; converse?: { initialize: (options: object) => unknown } };

function EmbeddedChat({ bootstrap, roomTitle }: { bootstrap: Bootstrap; roomTitle: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { resolvedTheme } = useTheme();
  const selectedTheme = resolvedTheme === 'dark' ? 'dracula' : 'default';
  const theme = useRef(selectedTheme);
  theme.current = selectedTheme;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    let active = true;
    const { credentials, assetsBase } = bootstrap;
    try {
      const assets = new URL(assetsBase.replace(/\/$/, '') + '/', location.origin);
      if (assets.origin !== location.origin) throw new Error();
      doc.documentElement.lang = 'en';
      doc.title = 'Room chat';
      const css = doc.createElement('link');
      css.rel = 'stylesheet';
      css.href = new URL('converse.min.css', assets).href;
      doc.head.append(css);
      const style = doc.createElement('style');
      style.textContent = `
        html, body { height: 100%; margin: 0; overflow: hidden; }
        converse-root { display: block; height: 100%; }
        .conversejs converse-chats.converse-embedded,
        .conversejs converse-chats.converse-embedded .chatbox { --overlayed-chat-width: 100%; }
        .conversejs.converse-embedded .chatroom,
        .conversejs.converse-embedded .chatroom-body,
        .conversejs.converse-embedded .chat-area,
        .conversejs.converse-embedded .chat-content,
        .conversejs.converse-embedded .chatroom .chat-textarea,
        .conversejs.converse-embedded .chatroom .chat-content__messages,
        .conversejs.converse-embedded .chat-msg__message,
        .conversejs.converse-embedded .chat-msg__body--wrapper {
          min-width: 0; min-height: 0; max-width: 100%;
        }
        converse-root.converse-embedded converse-muc.chatbox.chatroom,
        converse-root.converse-embedded converse-muc.chatroom .box-flyout {
          width: 100% !important; min-width: 0 !important; max-width: 100%; flex-shrink: 1;
        }
        .conversejs .chat-content__notifications,
        .conversejs .chat-content__notifications *,
        .conversejs .chat-msg__text a { white-space: normal; overflow-wrap: anywhere; }
        .conversejs .chat-content__messages { overscroll-behavior-y: contain; }
        .conversejs .chat-msg__text, .conversejs .chat-msg__author,
        .conversejs .chatbox-title__text { overflow-wrap: anywhere; }
        .conversejs .chatbox-title__text, .conversejs .chat-msg__author,
        .conversejs .chat-msg__author a { white-space: normal; overflow-wrap: anywhere; }
        .conversejs .chat-msg__author { min-width: 0; }
        @media (max-height: 400px) {
          .conversejs .chat-textarea { min-height: 2.5rem; }
        }
      `;
      doc.head.append(style);
      const root = doc.createElement('converse-root');
      doc.body.append(root);
      // Converse 12 adds native autofocus to its composer when rendering a room.
      const removeAutofocus = () => {
        for (const input of root.querySelectorAll("textarea.chat-textarea[autofocus]")) {
          input.removeAttribute("autofocus");
        }
      };
      const composerObserver = new MutationObserver(removeAutofocus);
      composerObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["autofocus"] });
      const syncTheme = () => {
        for (const attr of ['data-bs-theme', 'data-converse-theme']) {
          if (root.getAttribute(attr) !== theme.current) root.setAttribute(attr, theme.current);
        }
      };
      const observer = new MutationObserver(syncTheme);
      observer.observe(root, { attributes: true, attributeFilter: ['data-bs-theme', 'data-converse-theme'] });
      syncTheme();
      const script = doc.createElement('script');
      script.type = 'module';
      script.src = new URL('converse.min.js', assets).href;
      script.onerror = () => { if (active) setFailed(true); };
      script.onload = async () => {
        if (!active) return;
        try {
          const win = frame.current?.contentWindow as ConverseWindow | null;
          if (!win?.converse) throw new Error();
          // Converse 12 checks room criteria with instanceof Object inside the iframe.
          await win.converse.initialize(win.JSON.parse(JSON.stringify({
            assets_path: assets.href, view_mode: 'embedded', singleton: true, i18n: 'en',
            theme: 'default', dark_theme: 'dracula',
            authentication: 'login', auto_login: true, auto_focus: false, jid: credentials.jid, password: credentials.password,
            websocket_url: credentials.websocketUrl, discover_connection_methods: false,
            auto_join_rooms: [{ jid: credentials.roomJid, nick: credentials.nick, name: credentials.roomTitle || roomTitle }],
            persistent_store: 'sessionStorage', clear_cache_on_logout: true,
            visible_toolbar_buttons: { call: false },
            allow_logout: false, allow_registration: false, auto_reconnect: true, loglevel: 'error',
          })));
        } catch { if (active) setFailed(true); }
      };
      doc.head.append(script);
      return () => { active = false; composerObserver.disconnect(); observer.disconnect(); script.remove(); css.remove(); style.remove(); doc.body.replaceChildren(); };
    } catch { setFailed(true); }
  }, [bootstrap, roomTitle]);

  useEffect(() => {
    const root = frame.current?.contentDocument?.querySelector('converse-root');
    root?.setAttribute('data-bs-theme', selectedTheme);
    root?.setAttribute('data-converse-theme', selectedTheme);
  }, [selectedTheme]);

  return <>
    {failed && <p role="alert">Chat could not start. Reopen this room to try again.</p>}
    <iframe className="converseFrame" title="Room chat messages" style={{ colorScheme: resolvedTheme === 'dark' ? 'dark' : 'light' }} ref={frame} />
  </>;
}

export default function WorkspaceChat({ path, demo, roomTitle }: { path: string; demo: boolean; roomTitle: string }) {
  const [result, setResult] = useState<Bootstrap | 'native' | 'unavailable' | null>(demo ? 'native' : null);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const options = { cache: 'no-store', signal: controller.signal } as const;
    void (async () => {
      try {
        const status = await fetch(path + '/xmpp', options);
        if (!status.ok) throw new Error();
        const { enabled, assetsBase } = await status.json();
        if (!enabled) { if (!controller.signal.aborted) setResult('native'); return; }
        const response = await fetch(path + '/xmpp', { ...options, method: 'POST' });
        if (!response.ok) throw new Error();
        const credentials: Credentials = await response.json();
        if (!controller.signal.aborted) setResult({ assetsBase, credentials });
      } catch { if (!controller.signal.aborted) setResult('unavailable'); }
    })();
    return () => controller.abort();
  }, [path, demo, attempt]);

  if (result === 'native') return <RoomChat path={path} />;
  return <Card className="panel chat embeddedChat" id="chat" aria-label="Room chat">
    <h2>Room chat<span className="sr-only"> · {roomTitle}</span></h2>
    {!result ? <p role="status">Connecting to room chat…</p>
      : result === 'unavailable' ? <div className="grid gap-2">
        <p role="alert">Room chat is unavailable. The meeting and whiteboard are still accessible.</p>
        <div><Button variant="outline" onClick={() => { setResult(null); retry(value => value + 1); }}>Retry chat connection</Button></div>
      </div> : <EmbeddedChat bootstrap={result} roomTitle={roomTitle} />}
  </Card>;
}
