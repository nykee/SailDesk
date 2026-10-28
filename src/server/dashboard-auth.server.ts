import { env } from 'cloudflare:workers';

const DASHBOARD_COOKIE = '__Host-saildesk';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const WRONG_PASSWORD_DELAY_MS = 400;

type DashboardSession = { expiresAt: number };

/**
 * Checks the setup password and issues a signed HttpOnly cookie. It keeps a
 * private dashboard private even when its address is a public hostname.
 */
export async function unlockDashboard(password: string): Promise<string> {
  if (!timingSafeEqual(password, requiredEnv('DASHBOARD_PASSWORD'))) {
    // A fixed delay caps how fast a wrong password can be retried. Cloudflare's
    // rate limiting binding was evaluated and does not count reliably on this
    // account, so this stays deterministic instead of depending on it.
    await sleep(WRONG_PASSWORD_DELAY_MS);
    throw new DashboardAuthError(401, '访问密码不正确。');
  }
  const encoded = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ expiresAt: Date.now() + SESSION_MAX_AGE * 1000 })
    )
  );
  return serializeCookie(`${encoded}.${await sign(encoded)}`, SESSION_MAX_AGE);
}

/** Every data route calls this before it reads any GSC data or credential. */
export async function requireDashboardSession(request: Request): Promise<void> {
  const cookie = readCookie(request, DASHBOARD_COOKIE);
  if (!cookie) throw new DashboardAuthError(401, '请输入看板访问密码。');
  const [encoded, signature] = cookie.split('.');
  if (
    !encoded ||
    !signature ||
    !timingSafeEqual(signature, await sign(encoded))
  )
    throw new DashboardAuthError(401, '看板会话已失效，请重新输入访问密码。');
  try {
    const session = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded))
    ) as DashboardSession;
    if (session.expiresAt <= Date.now())
      throw new DashboardAuthError(401, '看板会话已过期，请重新输入访问密码。');
  } catch (error) {
    if (error instanceof DashboardAuthError) throw error;
    throw new DashboardAuthError(401, '看板会话无效，请重新输入访问密码。');
  }
}

/** Clears the origin-bound password session without affecting OAuth credentials. */
export function clearDashboardSession(): string {
  return `${DASHBOARD_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function requiredEnv(name: keyof Cloudflare.Env): string {
  const value = env[name];
  if (typeof value !== 'string' || !value)
    throw new DashboardAuthError(503, `缺少 ${name} Cloudflare Secret。`);
  return value;
}
function readCookie(request: Request, name: string): string | null {
  return (
    request.headers
      .get('cookie')
      ?.split(/;\s*/)
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  );
}
function serializeCookie(value: string, maxAge: number): string {
  return `${DASHBOARD_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requiredEnv('DASHBOARD_SESSION_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return bytesToBase64Url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
    )
  );
}
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

/** Error used to distinguish a locked dashboard from GSC upstream failures. */
export class DashboardAuthError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
