import 'server-only';
import { SipClient } from 'livekit-server-sdk';
import { awsClient, awsNotification } from './aws-notification.mjs';
import { accountsEnabled, demo } from './store';

export type Method = 'sms' | 'android' | 'voice' | 'sip';
export type Provider = 'android' | 'webhook' | 'aws' | 'sip';
export const providerLabels: Record<Provider, string> = { android: 'Android', webhook: 'Webhook', aws: 'AWS', sip: 'LiveKit SIP' };
export type Status = 'pending' | 'accepted' | 'rejected' | 'unknown';
export const methodLabels: Record<Method, string> = { sms: 'SMS', android: 'Call via Android', voice: 'Play voice alert', sip: 'Call into the meeting room' };
export const statusLabels: Record<Status, string> = { pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected', unknown: 'Unknown' };

function endpoint(value: string | undefined, allowLoopback = true) {
  try {
    const url = new URL(value || '');
    const loopback = allowLoopback && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!loopback && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) return;
    return url.href;
  } catch {
    return undefined;
  }
}

function configuredProvider(channel: 'sms' | 'voice'): Provider | undefined {
  const { ANDROID_GATEWAY_URL, ANDROID_GATEWAY_KEY, NOTIFICATION_WEBHOOK_URL, NOTIFICATION_WEBHOOK_TOKEN,
    AWS_REGION, AWS_SMS_ORIGINATION_IDENTITY, AWS_VOICE_ORIGINATION_IDENTITY, AWS_VOICE_ID } = process.env;
  const selected = (channel === 'sms' ? process.env.SMS_PROVIDER : process.env.CALL_PROVIDER) ?? 'android';
  if (selected === 'android' && endpoint(ANDROID_GATEWAY_URL) && ANDROID_GATEWAY_KEY) return selected;
  if (selected === 'webhook' && endpoint(NOTIFICATION_WEBHOOK_URL, process.env.RESPONSEABLE_SECURE_COOKIE === 'false') && NOTIFICATION_WEBHOOK_TOKEN) return selected;
  if (selected === 'aws' && AWS_REGION && (channel === 'sms' ? AWS_SMS_ORIGINATION_IDENTITY : AWS_VOICE_ORIGINATION_IDENTITY && AWS_VOICE_ID)) return selected;
}

export function notificationsAvailable(): Partial<Record<Method, Provider>> {
  if (demo) return {};
  const sms = (!accountsEnabled() || process.env.RESPONSEABLE_INVITE_KEY) ? configuredProvider('sms') : undefined;
  const call = configuredProvider('voice');
  const { LIVEKIT_INTERNAL_URL, LIVEKIT_SIP_TRUNK_ID, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  return {
    sms, android: call === 'android' ? call : undefined, voice: call !== 'android' ? call : undefined,
    sip: LIVEKIT_INTERNAL_URL && LIVEKIT_SIP_TRUNK_ID && LIVEKIT_API_KEY && LIVEKIT_API_SECRET ? 'sip' : undefined,
  };
}

export function isMethod(value: string): value is Method {
  return Object.hasOwn(methodLabels, value);
}

async function gateway(path: string, payload?: object) {
  return fetch(endpoint(process.env.ANDROID_GATEWAY_URL)!.replace(/\/?$/, '/') + path, {
    method: payload ? 'POST' : 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000),
    headers: { 'X-Android-Key': process.env.ANDROID_GATEWAY_KEY!, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export async function dispatch(provider: Provider, method: Method, id: string, room: string, number: string, text: string): Promise<Status> {
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
  if (provider === 'aws') {
    const client = awsClient(process.env.AWS_REGION!);
    const voice = method === 'voice';
    try {
      return await awsNotification(client, {
        number, body: text,
        identity: voice ? process.env.AWS_VOICE_ORIGINATION_IDENTITY! : process.env.AWS_SMS_ORIGINATION_IDENTITY!,
        voice: voice ? process.env.AWS_VOICE_ID : undefined,
      });
    } finally {
      client.destroy();
    }
  }
  if (provider === 'webhook') {
    try {
      const response = await fetch(endpoint(process.env.NOTIFICATION_WEBHOOK_URL, process.env.RESPONSEABLE_SECURE_COOKIE === 'false')!, {
        method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000),
        headers: { Authorization: 'Bearer ' + process.env.NOTIFICATION_WEBHOOK_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, capability: method, number, text }),
      });
      if (response.status >= 400 && response.status < 500 && response.status !== 408) return 'rejected';
      if (!response.ok) return 'unknown';
      const { status } = await response.json();
      return status === 'accepted' || status === 'rejected' ? status : 'unknown';
    } catch {
      return 'unknown';
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
