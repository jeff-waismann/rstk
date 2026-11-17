import {
  jsonResponse,
  hashPassword,
  generateToken,
  buildClientSessionCookie,
  verifyTurnstile,
  cleanDigits
} from '../../../server/client-auth.js';

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

    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '').trim();
    const turnstileToken = String(body.turnstileToken || '').trim();

    if (!identifier || !password) {
      return jsonResponse(
        { success: false, error: 'Informe seu CNPJ ou E-mail e sua senha.' },
        400
      );
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    // Anti-bot Turnstile verification
    const turnstileResult = await verifyTurnstile(turnstileToken, clientIp, env);
    if (!turnstileResult.success) {
      return jsonResponse({ success: false, error: turnstileResult.error }, 400);
    }

    const nowSec = Math.floor(Date.now() / 1000);

    // Rate-limit check by IP
    const attemptRow = await env.DB.prepare(
      'SELECT attempts, locked_until FROM rstk_login_attempts WHERE ip = ?'
    )
      .bind(`client_${clientIp}`)
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

    // Identificador pode ser email ou CNPJ (com ou sem máscara)
    const cleanId = cleanDigits(identifier);
    const lowerId = identifier.toLowerCase();

    const customer = await env.DB.prepare(
      `SELECT id, cnpj, razao_social, nome_fantasia, ie, responsavel_nome, email, telefone, password_hash, status, email_verified
       FROM rstk_customers
       WHERE LOWER(email) = ? OR REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ?`
    )
      .bind(lowerId, cleanId || 'INVALID_CNPJ')
      .first();

    const inputHash = await hashPassword(password);
    const valid = Boolean(customer && customer.password_hash === inputHash);

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
        .bind(`client_${clientIp}`, nextAttempts, lockedUntil, nowSec)
        .run();

      return jsonResponse(
        { success: false, error: 'CNPJ/E-mail ou senha incorretos.' },
        401
      );
    }

    // Reset login attempts on success
    if (attemptRow) {
      await env.DB.prepare('DELETE FROM rstk_login_attempts WHERE ip = ?')
        .bind(`client_${clientIp}`)
        .run();
    }

    // Cria sessão do cliente válida por 30 dias
    const token = generateToken(32);
    const expiresAt = nowSec + 30 * 24 * 60 * 60;
    const userAgent = (request.headers.get('user-agent') || '').slice(0, 255);

    await env.DB.prepare(
      `INSERT INTO rstk_customer_sessions (customer_id, token, ip, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(customer.id, token, clientIp, userAgent, expiresAt)
      .run();

    const cookieHeader = buildClientSessionCookie(token, request.url, 30 * 24 * 60 * 60);

    return jsonResponse(
      {
        success: true,
        customer: {
          id: Number(customer.id),
          razaoSocial: customer.razao_social,
          nomeFantasia: customer.nome_fantasia || '',
          cnpj: customer.cnpj,
          email: customer.email,
          responsavelNome: customer.responsavel_nome,
          emailVerified: Boolean(customer.email_verified)
        }
      },
      200,
      { 'Set-Cookie': cookieHeader }
    );
  } catch (err) {
    console.error('Customer login error:', err);
    return jsonResponse({ success: false, error: 'Erro interno ao realizar login.' }, 500);
  }
}
