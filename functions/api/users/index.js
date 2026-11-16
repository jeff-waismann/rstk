import { jsonResponse, requireAuth, hashPassword } from '../../../server/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const { results } = await env.DB.prepare(
      'SELECT id, username, email, role, created_at FROM rstk_users ORDER BY created_at ASC'
    ).all();

    return jsonResponse({
      success: true,
      users: results || []
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  if (auth.user.role !== 'master') {
    return jsonResponse(
      { success: false, error: 'Apenas Master Admin pode criar novos usuários.' },
      403
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Dados inválidos.' }, 400);
    }

    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const role = body.role === 'master' ? 'master' : 'admin';

    if (!username || !email || !password) {
      return jsonResponse(
        { success: false, error: 'Nome, e-mail e senha são obrigatórios.' },
        400
      );
    }

    if (password.length < 6) {
      return jsonResponse(
        { success: false, error: 'A senha deve ter pelo menos 6 caracteres.' },
        400
      );
    }

    const existing = await env.DB.prepare(
      'SELECT id FROM rstk_users WHERE LOWER(email) = ?'
    )
      .bind(email)
      .first();

    if (existing) {
      return jsonResponse(
        { success: false, error: 'Já existe um usuário cadastrado com este e-mail.' },
        409
      );
    }

    const passwordHash = await hashPassword(password);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await env.DB.prepare(
      `INSERT INTO rstk_users (id, username, email, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(userId, username, email, passwordHash, role)
      .run();

    return jsonResponse(
      {
        success: true,
        user: { id: userId, username, email, role }
      },
      201
    );
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
