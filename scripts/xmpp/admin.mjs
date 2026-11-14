import { createHmac } from 'node:crypto';

export function identity(secret, grant, room) {
  return 'ra-' + createHmac('sha256', secret)
    .update(JSON.stringify(['responseable/xmpp/v1', grant, room]))
    .digest('hex').slice(0, 40);
}

export function password(secret, jid, expiresAt) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = encode({ alg: 'HS256', typ: 'JWT' }) + '.' +
    encode({ jid, exp: Math.floor(expiresAt / 1000) });
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}

export async function affiliate(baseUrl, bearer, room, service, jid, member, fetcher = fetch) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw Error('XMPP admin URL must use HTTPS');
  }
  const [user, host] = jid.split("@");
  const response = await fetcher(url.href.replace(/\/?$/, '/') + 'set_room_affiliation', {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, service, user, host, affiliation: member ? 'member' : 'outcast' }),
  });
  if (!response.ok || await response.json() !== 0) throw Error('XMPP affiliation update not confirmed');
}
