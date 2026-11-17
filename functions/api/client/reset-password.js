import {
  jsonResponse,
  hashPassword,
  verifyTurnstile
} from '../../../server/client-auth.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Requisição inválida.' }, 400);
    }

    const token = String(body.token || '').trim();
    const newPassword = String(body.newPassword || '').trim();
    const turnstileToken = String(body.turnstileToken || '').trim();

    if (!token) {
      return jsonResponse({ success: false, error: 'Token de recuperação não fornecido.' }, 400);
    }
    if (newPassword.length < 6) {
      return jsonResponse({ success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' }, 400);
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    const turnstileResult = await verifyTurnstile(turnstileToken, clientIp, env);
    if (!turnstileResult.success) {
      return jsonResponse({ success: false, error: turnstileResult.error }, 400);
    }

    const nowSec = Math.floor(Date.now() / 1000);

    const customer = await env.DB.prepare(
      `SELECT id, razao_social, email, reset_token_expires 
       FROM rstk_customers 
       WHERE reset_token = ?`
    )
      .bind(token)
      .first();

    if (!customer || !customer.reset_token_expires || customer.reset_token_expires < nowSec) {
      return jsonResponse(
        { success: false, error: 'O link de recuperação expirou ou é inválido. Solicite um novo link.' },
        400
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await env.DB.prepare(
      `UPDATE rstk_customers 
       SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(passwordHash, customer.id)
      .run();

    // Revoga sessões antigas
    await env.DB.prepare('DELETE FROM rstk_customer_sessions WHERE customer_id = ?')
      .bind(customer.id)
      .run()
      .catch(() => {});

    return jsonResponse({
      success: true,
      message: 'Senha alterada com sucesso! Você já pode realizar o login com a nova senha.'
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return jsonResponse({ success: false, error: 'Erro ao redefinir senha.' }, 500);
  }
}
