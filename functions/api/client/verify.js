import { jsonResponse } from '../../../server/client-auth.js';

export async function onRequest({ request, env }) {
  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const url = new URL(request.url);
    let token = url.searchParams.get('token');

    if (!token && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      token = body?.token;
    }

    token = String(token || '').trim();

    if (!token) {
      return jsonResponse({ success: false, error: 'Token de confirmação não fornecido.' }, 400);
    }

    const customer = await env.DB.prepare(
      'SELECT id, razao_social, email FROM rstk_customers WHERE verification_token = ?'
    )
      .bind(token)
      .first();

    if (!customer) {
      return jsonResponse(
        { success: false, error: 'Token de confirmação inválido ou já utilizado.' },
        404
      );
    }

    await env.DB.prepare(
      `UPDATE rstk_customers 
       SET email_verified = 1, status = 'active', verification_token = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(customer.id)
      .run();

    return jsonResponse({
      success: true,
      message: 'E-mail confirmado com sucesso!',
      customer: {
        id: customer.id,
        razaoSocial: customer.razao_social,
        email: customer.email
      }
    });
  } catch (err) {
    console.error('Email verification error:', err);
    return jsonResponse({ success: false, error: 'Erro ao confirmar e-mail.' }, 500);
  }
}
