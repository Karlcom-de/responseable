'use client';

import { DisconnectButton, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, TrackToggle, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

function Conference() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }]);
  return <>
    <div className="mediaGrid"><GridLayout tracks={tracks}><ParticipantTile /></GridLayout></div>
    <RoomAudioRenderer />
    <div className="mediaControls">
      <TrackToggle source={Track.Source.Microphone}>Microphone</TrackToggle>
      <TrackToggle source={Track.Source.Camera}>Camera</TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare}>Share screen</TrackToggle>
      <DisconnectButton>Leave meeting</DisconnectButton>
    </div>
  </>;
}

export default function Media({ url, token, leave, fail }: { url: string; token: string; leave: () => void; fail: () => void }) {
  return <div className="media" data-lk-theme="default">
    <LiveKitRoom serverUrl={url} token={token} connect audio={false} video={false} onDisconnected={leave} onError={fail}>
      <Conference />
    </LiveKitRoom>
  </div>;
}
