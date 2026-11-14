import 'server-only';
import { SipClient } from 'livekit-server-sdk';
import { demo } from './store';

export type Method = 'sms' | 'android' | 'sip';
export type Status = 'pending' | 'accepted' | 'rejected' | 'unknown';
export const methodLabels: Record<Method, string> = { sms: 'SMS', android: 'Über Android anrufen', sip: 'In den Meetingraum anrufen' };
export const statusLabels: Record<Status, string> = { pending: 'Offen', accepted: 'Angenommen', rejected: 'Abgelehnt', unknown: 'Unklar' };

function androidBase() {
  try {
    const url = new URL(process.env.ANDROID_GATEWAY_URL || '');
    const loopback = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!loopback && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) return;
    return url.href.replace(/\/?$/, '/');
  } catch {
    return undefined;
  }
}

export function notificationsAvailable() {
  return {
    android: Boolean(!demo && androidBase() && process.env.ANDROID_GATEWAY_KEY),
    sip: Boolean(!demo && process.env.LIVEKIT_INTERNAL_URL && process.env.LIVEKIT_SIP_TRUNK_ID &&
      process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
  };
}

async function gateway(path: string, payload?: object) {
  return fetch(androidBase() + path, {
    method: payload ? 'POST' : 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000),
    headers: { 'X-Android-Key': process.env.ANDROID_GATEWAY_KEY!, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export async function dispatch(method: Method, id: string, room: string, number: string, text: string): Promise<Status> {
  if (method === 'sip') {
    try {
      const sip = new SipClient(process.env.LIVEKIT_INTERNAL_URL!, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
      await sip.createSipParticipant(process.env.LIVEKIT_SIP_TRUNK_ID!, number, room, {
        participantIdentity: 'pstn-' + id, ringingTimeout: 25, timeout: 35, waitUntilAnswered: true,
      });
      return 'accepted';
    } catch (error) {
      const status = (error as { status?: number }).status;
      return status && [400, 401, 403, 404, 422, 486, 603].includes(status) ? 'rejected' : 'unknown';
    }
  }
  try {
    const health = await gateway('health');
    if (!health.ok) return 'rejected';
    const readiness = await health.json();
    if (readiness.ok !== true || readiness.result?.androidReady !== true) return 'rejected';
  } catch {
    return 'rejected';
  }
  try {
    const response = await (method === 'sms' ? gateway('sms/send', { number, text }) : gateway('call/outgoing', { number }));
    if (response.status >= 400 && response.status < 500 && response.status !== 408) return 'rejected';
    if (!response.ok) return 'unknown';
    const result = await response.json();
    if (result.ok === true) return 'accepted';
    return result.ok === false ? 'rejected' : 'unknown';
  } catch {
    return 'unknown';
  }
}
