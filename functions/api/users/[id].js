import { jsonResponse, requireAuth, hashPassword } from '../../../server/auth.js';

export async function onRequestPut({ params, request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  const targetId = String(params.id || '').trim();
  if (!targetId) {
    return jsonResponse({ success: false, error: 'ID inválido.' }, 400);
  }

  // Only Master Admin can manage other accounts; standard admins can only update their own password/name
  if (auth.user.role !== 'master' && auth.user.id !== targetId) {
    return jsonResponse(
      { success: false, error: 'Apenas Master Admin pode gerenciar outros administradores.' },
      403
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Payload inválido.' }, 400);
    }

    const existing = await env.DB.prepare(
      'SELECT id, username, email, role FROM rstk_users WHERE id = ?'
    )
      .bind(targetId)
      .first();

    if (!existing) {
      return jsonResponse({ success: false, error: 'Usuário não encontrado.' }, 404);
    }

    const username = String(body.username || existing.username).trim();
    const email = String(body.email || existing.email).trim().toLowerCase();
    const role =
      auth.user.role === 'master'
        ? body.role === 'master'
          ? 'master'
          : 'admin'
        : existing.role;

    const newPassword = String(body.password || '').trim();
    if (newPassword) {
      if (newPassword.length < 6) {
        return jsonResponse(
          { success: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' },
          400
        );
      }
      const passwordHash = await hashPassword(newPassword);
      await env.DB.prepare(
        'UPDATE rstk_users SET username = ?, email = ?, role = ?, password_hash = ? WHERE id = ?'
      )
        .bind(username, email, role, passwordHash, targetId)
        .run();
    } else {
      await env.DB.prepare(
        'UPDATE rstk_users SET username = ?, email = ?, role = ? WHERE id = ?'
      )
        .bind(username, email, role, targetId)
        .run();
    }

    return jsonResponse({
      success: true,
      user: { id: targetId, username, email, role }
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestDelete({ params, request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  const targetId = String(params.id || '').trim();
  if (!targetId) {
    return jsonResponse({ success: false, error: 'ID inválido.' }, 400);
  }

  // User rule: Self-deletion is strictly forbidden for all accounts
  if (auth.user.id === targetId) {
    return jsonResponse(
      { success: false, error: 'Auto-exclusão é estritamente proibida para todas as contas.' },
      403
    );
  }

  // User rule: Only Master Admin can manage standard admins
  if (auth.user.role !== 'master') {
    return jsonResponse(
      { success: false, error: 'Apenas Master Admin pode remover administradores.' },
      403
    );
  }

  try {
    await env.DB.prepare('DELETE FROM rstk_sessions WHERE user_id = ?').bind(targetId).run();
    await env.DB.prepare('DELETE FROM rstk_users WHERE id = ?').bind(targetId).run();

    return jsonResponse({ success: true, message: 'Usuário removido com sucesso.' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
