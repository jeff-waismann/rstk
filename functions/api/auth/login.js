import {
  jsonResponse,
  hashPassword,
  generateSessionToken,
  buildSessionCookie
} from '../../../server/auth.js';

const MAX_ATTEMPTS = 10;
const LOCK_SECONDS = 15 * 60;

export async function onRequestPost({ request, env }) {
  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Requisição inválida.' }, 400);
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const turnstileToken = String(body.turnstileToken || '').trim();

    if (!email || !password) {
      return jsonResponse({ success: false, error: 'E-mail e senha são obrigatórios.' }, 400);
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    const nowSec = Math.floor(Date.now() / 1000);

    // Rate-limit check
    const attemptRow = await env.DB.prepare(
      'SELECT attempts, locked_until FROM rstk_login_attempts WHERE ip = ?'
    )
      .bind(clientIp)
      .first();

    if (attemptRow && attemptRow.locked_until > nowSec) {
      return jsonResponse(
        {
          success: false,
          error: 'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.'
        },
        429
      );
    }

    // Turnstile verification (Anti-bot protection)
    const turnstileSecret = env?.TURNSTILE_SECRET_KEY || '0x4AAAAAADN7xoCAAz5NV-OPnZz92mxahL4';
    if (turnstileSecret) {
      if (!turnstileToken) {
        return jsonResponse(
          { success: false, error: 'Complete a verificação de segurança Turnstile.' },
          400
        );
      }
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: turnstileSecret,
          response: turnstileToken,
          remoteip: clientIp
        })
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return jsonResponse(
          { success: false, error: 'Validação Turnstile falhou. Tente novamente.' },
          400
        );
      }
    }

    const user = await env.DB.prepare(
      'SELECT id, username, email, password_hash, role FROM rstk_users WHERE LOWER(email) = ?'
    )
      .bind(email)
      .first();

    const inputHash = await hashPassword(password);
    const valid = Boolean(user && user.password_hash === inputHash);

    if (!valid) {
      const nextAttempts = (attemptRow?.attempts || 0) + 1;
      const lockedUntil = nextAttempts >= MAX_ATTEMPTS ? nowSec + LOCK_SECONDS : 0;
      await env.DB.prepare(
        `INSERT INTO rstk_login_attempts (ip, attempts, locked_until, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET
           attempts = excluded.attempts,
           locked_until = excluded.locked_until,
           updated_at = excluded.updated_at`
      )
        .bind(clientIp, nextAttempts, lockedUntil, nowSec)
        .run();

      return jsonResponse(
        { success: false, error: 'Credenciais inválidas. Verifique seu e-mail e senha.' },
        401
      );
    }

    // Reset rate-limit on valid login
    await env.DB.prepare('DELETE FROM rstk_login_attempts WHERE ip = ?').bind(clientIp).run();

    // Clean expired sessions opportunistically
    await env.DB.prepare('DELETE FROM rstk_sessions WHERE expires_at <= ?').bind(nowSec).run();

    const token = generateSessionToken();
    const ttlSeconds = 60 * 60 * 24 * 7; // 7 days
    await env.DB.prepare(
      'INSERT INTO rstk_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
    )
      .bind(token, user.id, nowSec + ttlSeconds)
      .run();

    return jsonResponse(
      {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      },
      200,
      {
        'Set-Cookie': buildSessionCookie(token, request.url, ttlSeconds)
      }
    );
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
