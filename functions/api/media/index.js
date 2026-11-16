import { jsonResponse, requireAuth } from '../../../server/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const mimeType = (url.searchParams.get('mimeType') || '').trim().toLowerCase();

    let query = 'SELECT * FROM rstk_media WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (LOWER(filename) LIKE ? OR LOWER(url) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (mimeType && mimeType !== 'all') {
      query += ' AND LOWER(mime_type) LIKE ?';
      params.push(`${mimeType}%`);
    }

    query += ' ORDER BY created_at DESC, id DESC';

    const stmt = env.DB.prepare(query);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    return jsonResponse({
      success: true,
      items: results || []
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const id = String(url.searchParams.get('id') || '').trim();
    if (!id) {
      return jsonResponse({ success: false, error: 'ID obrigatório.' }, 400);
    }

    const media = await env.DB.prepare('SELECT * FROM rstk_media WHERE id = ?')
      .bind(id)
      .first();

    if (media) {
      if (env.R2 && media.r2_key && media.r2_key.startsWith('uploads/')) {
        try {
          await env.R2.delete(media.r2_key);
        } catch (r2Err) {
          console.warn('Erro ao deletar arquivo no R2:', r2Err);
        }
      }
      await env.DB.prepare('DELETE FROM rstk_media WHERE id = ?').bind(id).run();
    }

    return jsonResponse({ success: true, message: 'Mídia removida com sucesso.' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
