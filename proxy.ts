import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.method === 'GET' || request.method === 'HEAD') return NextResponse.next();

  const configured = process.env.RESPONSEABLE_PUBLIC_ORIGIN;
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || (configured ? origin !== configured : origin !== 'http://' + host)) {
    return new NextResponse(null, { status: 403 });
  }
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', new URL(origin).host);
  headers.set('x-forwarded-proto', new URL(origin).protocol.slice(0, -1));
  return NextResponse.next({ request: { headers } });
}
