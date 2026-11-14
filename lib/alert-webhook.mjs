export function alertEndpoint(value, token) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
        typeof token === 'string' && /^[A-Za-z0-9._~-]{32,256}$/.test(token)) return url;
  } catch {}
}

export async function deliverAlert(url, token, event, send = fetch) {
  try {
    const response = await send(url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Idempotency-Key': event.id,
      },
      body: JSON.stringify(event),
    });
    await response.body?.cancel();
    return response.ok ? 'accepted' : 'unclear';
  } catch {
    return 'unclear';
  }
}
