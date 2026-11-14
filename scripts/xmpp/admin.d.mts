export function identity(secret: string, grant: string, room: string): string;
export function password(secret: string, jid: string, expiresAt: number): string;
export function affiliate(baseUrl: string, bearer: string, room: string, service: string, jid: string, member: boolean): Promise<void>;
