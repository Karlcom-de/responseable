'use client';

import { DisconnectButton, FocusLayout, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio, TrackToggle, useConnectionState, useTracks } from '@livekit/components-react';
import { useEffect, useState } from 'react';
import { ConnectionState, Track } from 'livekit-client';
import '@livekit/components-styles';

function Conference({ showShare, onShareChange }: { showShare: boolean; onShareChange: (sharing: boolean) => void }) {
  const [error, setError] = useState('');
  const connection = useConnectionState();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const share = tracks.find(track => track.source === Track.Source.ScreenShare);
  const sharing = Boolean(share);
  useEffect(() => { onShareChange(sharing); return () => onShareChange(false); }, [sharing, onShareChange]);
  return <>
    <div className="mediaGrid">{showShare ? share ? <FocusLayout trackRef={share} /> : <p className="muted">No screen is being shared.</p> : <GridLayout tracks={tracks.filter(track => track.source === Track.Source.Camera)}><ParticipantTile /></GridLayout>}</div>
    <RoomAudioRenderer />
    <p className="muted" role="status">{connection === ConnectionState.Reconnecting ? "Reconnecting to meeting…" : connection === ConnectionState.Connected ? "Meeting connected" : "Connecting to meeting…"}</p>
    <StartAudio label="Enable meeting audio" />
    {error && <p role="alert">{error}</p>}
    <div className="mediaControls">
      <TrackToggle source={Track.Source.Microphone} onChange={() => setError('')}
        onDeviceError={() => setError('Could not access the microphone. Check browser permissions and your input device.')}>Microphone</TrackToggle>
      <TrackToggle source={Track.Source.Camera} onChange={() => setError('')}
        onDeviceError={() => setError('Could not access the camera. Check browser permissions and your camera.')} >Camera</TrackToggle>
      {typeof navigator.mediaDevices?.getDisplayMedia === "function" ? <TrackToggle source={Track.Source.ScreenShare} onChange={() => setError('')}
        onDeviceError={() => setError('Could not share the screen. Allow screen capture and choose a tab, window or display.')} >Share screen</TrackToggle> : <span className="muted">Screen sharing is unavailable on this device.</span>}
      <DisconnectButton>Leave meeting</DisconnectButton>
    </div>
  </>;
}

export default function Media({ url, token, connected, leave, fail, showShare, onShareChange }: { url: string; token: string; connected: () => void; leave: () => void; fail: () => void; showShare: boolean; onShareChange: (sharing: boolean) => void }) {
  return <div className="media" data-lk-theme="default">
    <LiveKitRoom serverUrl={url} token={token} connect audio={false} video={false} onConnected={connected} onDisconnected={leave} onError={fail}>
      <Conference showShare={showShare} onShareChange={onShareChange} />
    </LiveKitRoom>
  </div>;
}
