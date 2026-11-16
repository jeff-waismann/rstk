import { jsonResponse, requireAuth } from '../../../server/auth.js';

const ALLOWED_SECTIONS = new Set(['settings']);

export async function onRequestGet({ params, env }) {
  try {
    const section = String(params.section || '').trim();
    if (!ALLOWED_SECTIONS.has(section)) {
      return jsonResponse({ success: false, error: 'Seção não encontrada.' }, 404);
    }
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const row = await env.DB.prepare(
      'SELECT content_json, updated_at FROM rstk_site_content WHERE section_key = ?'
    )
      .bind(section)
      .first();

    const data = row?.content_json ? JSON.parse(row.content_json) : null;

    return jsonResponse({
      success: true,
      section,
      data,
      updatedAt: row?.updated_at || null
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleSave({ params, request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const section = String(params.section || '').trim();
    if (!ALLOWED_SECTIONS.has(section)) {
      return jsonResponse({ success: false, error: 'Seção inválida.' }, 400);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonResponse({ success: false, error: 'Dados inválidos.' }, 400);
    }

    if (section === 'settings') {
      const priceCents = Math.max(0, Math.round(Number(body.priceCents ?? 18999)));
      body.priceCents = Number.isFinite(priceCents) ? priceCents : 18999;

      if (Array.isArray(body.heroFeaturedIds)) {
        body.heroFeaturedIds = body.heroFeaturedIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
          .slice(0, 3);
      }
      if (body.whatsappNumber) {
        body.whatsappNumber = String(body.whatsappNumber).replace(/\D/g, '');
      }
    }

    const contentJson = JSON.stringify(body);

    await env.DB.prepare(
      `INSERT INTO rstk_site_content (section_key, content_json, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(section_key) DO UPDATE SET
         content_json = excluded.content_json,
         updated_at = CURRENT_TIMESTAMP`
    )
      .bind(section, contentJson)
      .run();

    // Optionally apply global launch price to products if requested by admin
    if (section === 'settings' && body.applyPriceToAllCatalog === true) {
      await env.DB.prepare(
        'UPDATE rstk_products SET price_cents = ?, updated_at = CURRENT_TIMESTAMP'
      )
        .bind(body.priceCents)
        .run();
    }

    return jsonResponse({
      success: true,
      section,
      data: body
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestPut(context) {
  return handleSave(context);
}

export async function onRequestPost(context) {
  return handleSave(context);
}
