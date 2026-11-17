import {
  jsonResponse,
  requireClientAuth,
  hashPassword
} from '../../../server/client-auth.js';

export async function onRequestPost({ request, env }) {
  try {
    const { client, response } = await requireClientAuth(request, env);
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword || '').trim();
    const newPassword = String(body.newPassword || '').trim();
    const confirmPassword = String(body.confirmPassword || '').trim();

    if (!currentPassword) {
      return jsonResponse({ success: false, error: 'Informe sua senha atual.' }, 400);
    }
    if (!newPassword || newPassword.length < 6) {
      return jsonResponse({ success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' }, 400);
    }
    if (newPassword !== confirmPassword) {
      return jsonResponse({ success: false, error: 'A nova senha e a confirmação não conferem.' }, 400);
    }

    // Busca hash atual no banco
    const userRow = await env.DB.prepare(
      `SELECT id, password_hash FROM rstk_customers WHERE id = ?`
    )
      .bind(client.id)
      .first();

    if (!userRow) {
      return jsonResponse({ success: false, error: 'Cadastro do cliente não encontrado.' }, 404);
    }

    const currentHash = await hashPassword(currentPassword);
    if (currentHash !== userRow.password_hash) {
      return jsonResponse({ success: false, error: 'A senha atual está incorreta.' }, 400);
    }

    const newHash = await hashPassword(newPassword);
    await env.DB.prepare(
      `UPDATE rstk_customers
       SET password_hash = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(newHash, client.id)
      .run();

    return jsonResponse({
      success: true,
      message: 'Sua senha foi alterada com sucesso!'
    });
  } catch (err) {
    console.error('Change password error:', err);
    return jsonResponse({ success: false, error: err.message || 'Erro ao alterar senha.' }, 500);
  }
}
