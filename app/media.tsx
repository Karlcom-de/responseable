'use client';

import { DisconnectButton, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio, TrackToggle, useTracks } from '@livekit/components-react';
import { useState } from 'react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

function Conference() {
  const [error, setError] = useState('');
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }]);
  return <>
    <div className="mediaGrid"><GridLayout tracks={tracks}><ParticipantTile /></GridLayout></div>
    <RoomAudioRenderer />
    <StartAudio label="Enable meeting audio" />
    {error && <p role="alert">{error}</p>}
    <div className="mediaControls">
      <TrackToggle source={Track.Source.Microphone} onChange={() => setError('')}
        onDeviceError={() => setError('Could not access the microphone. Check browser permissions and your input device.')}>Microphone</TrackToggle>
      <TrackToggle source={Track.Source.Camera} onChange={() => setError('')}
        onDeviceError={() => setError('Could not access the camera. Check browser permissions and your camera.')} >Camera</TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare} onChange={() => setError('')}
        onDeviceError={() => setError('Could not share the screen. Allow screen capture and choose a tab, window or display.')} >Share screen</TrackToggle>
      <DisconnectButton>Leave meeting</DisconnectButton>
    </div>
  </>;
}

export default function Media({ url, token, connected, leave, fail }: { url: string; token: string; connected: () => void; leave: () => void; fail: () => void }) {
  return <div className="media" data-lk-theme="default">
    <LiveKitRoom serverUrl={url} token={token} connect audio={false} video={false} onConnected={connected} onDisconnected={leave} onError={fail}>
      <Conference />
    </LiveKitRoom>
  </div>;
}
