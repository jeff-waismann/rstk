/**
 * Shared authentication, session, cookie, and JSON response helpers
 * for RSTK Cloudflare Pages Functions.
 */

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

export async function hashPassword(password) {
  const bytes = new TextEncoder().encode(String(password));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSessionToken() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export function buildSessionCookie(token, requestUrl, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const isHttps = new URL(requestUrl).protocol === 'https:';
  const parts = [
    `rstk_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function clearSessionCookie(requestUrl) {
  return buildSessionCookie('', requestUrl, 0);
}

export async function getAuthenticatedUser(request, env) {
  if (!env?.DB) return null;
  const cookies = parseCookies(request);
  const token = cookies.rstk_session;
  if (!token) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.role
     FROM rstk_sessions s
     JOIN rstk_users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  )
    .bind(token, nowSeconds)
    .first();

  return row || null;
}

export async function requireAuth(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    return { user: null, response: jsonResponse({ success: false, error: 'Sessão expirada ou não autenticada.' }, 401) };
  }
  return { user, response: null };
}

export function sanitizeUrlPath(url, fallback = '') {
  const value = String(url ?? '').trim();
  if (!value) return fallback;
  if (value.startsWith('/') || value.startsWith('https://') || value.startsWith('http://')) {
    return value;
  }
  return fallback;
}
