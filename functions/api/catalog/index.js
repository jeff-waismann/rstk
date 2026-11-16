import {
  jsonResponse,
  getAuthenticatedUser,
  requireAuth,
  sanitizeUrlPath
} from '../../../server/auth.js';

function mapProductRow(row) {
  return {
    id: Number(row.id),
    artist: row.artist,
    title: row.title,
    sourceTitle: row.source_title || row.title.toUpperCase(),
    units: Number(row.units) || 1,
    media: row.media || 'LP',
    date: row.release_date || '2026-01-01',
    genre: row.genre,
    cover: row.cover_url,
    source: row.external_source || '',
    priceCents: Number.isFinite(Number(row.price_cents)) ? Number(row.price_cents) : 18999,
    stock: Number.isFinite(Number(row.stock)) ? Number(row.stock) : 30,
    active: Boolean(row.active),
    featuredHero: Boolean(row.featured_hero),
    sortOrder: Number(row.sort_order) || Number(row.id)
  };
}

function validateProductPayload(body, defaultPriceCents = 18999) {
  const artist = String(body.artist || '').trim();
  const title = String(body.title || '').trim();
  const genre = String(body.genre || '').trim();
  const cover = sanitizeUrlPath(body.cover || body.coverUrl, '');

  if (!artist || !title || !genre || !cover) {
    return { error: 'Artista, título, gênero e imagem da capa são obrigatórios.' };
  }

  const units = Math.max(1, Math.min(20, Math.round(Number(body.units) || 1)));
  const media = String(body.media || 'LP').trim() || 'LP';
  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '').trim())
    ? String(body.date).trim()
    : new Date().toISOString().slice(0, 10);
  const sourceTitle = String(body.sourceTitle || title).trim().toUpperCase();
  const externalSource = sanitizeUrlPath(body.source || body.externalSource, '');
  const priceCentsRaw = Number(body.priceCents);
  const priceCents = Number.isFinite(priceCentsRaw) && priceCentsRaw >= 0
    ? Math.round(priceCentsRaw)
    : defaultPriceCents;
  const stockRaw = Number(body.stock);
  const stock = Number.isFinite(stockRaw) && stockRaw >= 0 ? Math.round(stockRaw) : 30;
  const active = body.active === false || body.active === 0 ? 0 : 1;
  const featuredHero = body.featuredHero ? 1 : 0;
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Math.round(Number(body.sortOrder)) : 0;

  return {
    data: {
      artist,
      title,
      sourceTitle,
      units,
      media,
      releaseDate,
      genre,
      cover,
      externalSource,
      priceCents,
      stock,
      active,
      featuredHero,
      sortOrder
    }
  };
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const url = new URL(request.url);
    const wantsInactive = url.searchParams.get('includeInactive') === '1';
    const user = wantsInactive ? await getAuthenticatedUser(request, env) : null;
    const includeInactive = wantsInactive && Boolean(user);

    const settingsRow = await env.DB.prepare(
      "SELECT content_json FROM rstk_site_content WHERE section_key = 'settings'"
    ).first();

    let settings = null;
    if (settingsRow?.content_json) {
      try {
        settings = JSON.parse(settingsRow.content_json);
      } catch {
        settings = null;
      }
    }

    const sql = includeInactive
      ? 'SELECT * FROM rstk_products ORDER BY sort_order ASC, id ASC'
      : 'SELECT * FROM rstk_products WHERE active = 1 ORDER BY sort_order ASC, id ASC';

    const { results } = await env.DB.prepare(sql).all();
    const products = (results || []).map(mapProductRow);

    return jsonResponse({
      success: true,
      settings,
      products
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Payload inválido.' }, 400);
    }

    const settingsRow = await env.DB.prepare(
      "SELECT content_json FROM rstk_site_content WHERE section_key = 'settings'"
    ).first();
    const defaultPriceCents = settingsRow?.content_json
      ? Number(JSON.parse(settingsRow.content_json).priceCents) || 18999
      : 18999;

    const validated = validateProductPayload(body, defaultPriceCents);
    if (validated.error) {
      return jsonResponse({ success: false, error: validated.error }, 400);
    }

    const d = validated.data;
    const maxSortRow = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM rstk_products'
    ).first();
    const nextSortOrder = d.sortOrder > 0 ? d.sortOrder : Number(maxSortRow?.max_sort || 0) + 1;

    const result = await env.DB.prepare(
      `INSERT INTO rstk_products (
        artist, title, source_title, units, media, release_date, genre,
        cover_url, external_source, price_cents, stock, active, featured_hero, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(
        d.artist,
        d.title,
        d.sourceTitle,
        d.units,
        d.media,
        d.releaseDate,
        d.genre,
        d.cover,
        d.externalSource,
        d.priceCents,
        d.stock,
        d.active,
        d.featuredHero,
        nextSortOrder
      )
      .run();

    const createdId = result.meta?.last_row_id;
    const createdRow = await env.DB.prepare('SELECT * FROM rstk_products WHERE id = ?')
      .bind(createdId)
      .first();

    return jsonResponse({
      success: true,
      product: createdRow ? mapProductRow(createdRow) : null
    }, 201);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return jsonResponse({ success: false, error: 'ID do disco é obrigatório.' }, 400);
    }

    const id = Number(body.id);
    const existing = await env.DB.prepare('SELECT * FROM rstk_products WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ success: false, error: 'Disco não encontrado.' }, 404);
    }

    const validated = validateProductPayload(body, Number(existing.price_cents) || 18999);
    if (validated.error) {
      return jsonResponse({ success: false, error: validated.error }, 400);
    }

    const d = validated.data;
    const sortOrder = d.sortOrder > 0 ? d.sortOrder : Number(existing.sort_order) || id;

    await env.DB.prepare(
      `UPDATE rstk_products SET
        artist = ?,
        title = ?,
        source_title = ?,
        units = ?,
        media = ?,
        release_date = ?,
        genre = ?,
        cover_url = ?,
        external_source = ?,
        price_cents = ?,
        stock = ?,
        active = ?,
        featured_hero = ?,
        sort_order = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    )
      .bind(
        d.artist,
        d.title,
        d.sourceTitle,
        d.units,
        d.media,
        d.releaseDate,
        d.genre,
        d.cover,
        d.externalSource,
        d.priceCents,
        d.stock,
        d.active,
        d.featuredHero,
        sortOrder,
        id
      )
      .run();

    const updatedRow = await env.DB.prepare('SELECT * FROM rstk_products WHERE id = ?')
      .bind(id)
      .first();

    return jsonResponse({
      success: true,
      product: updatedRow ? mapProductRow(updatedRow) : null
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
    const id = Number(url.searchParams.get('id'));
    if (!id) {
      return jsonResponse({ success: false, error: 'ID obrigatório.' }, 400);
    }

    await env.DB.prepare('DELETE FROM rstk_products WHERE id = ?').bind(id).run();

    // Remove deleted product ID from heroFeaturedIds if present
    const settingsRow = await env.DB.prepare(
      "SELECT content_json FROM rstk_site_content WHERE section_key = 'settings'"
    ).first();

    if (settingsRow?.content_json) {
      try {
        const settings = JSON.parse(settingsRow.content_json);
        if (Array.isArray(settings.heroFeaturedIds) && settings.heroFeaturedIds.includes(id)) {
          settings.heroFeaturedIds = settings.heroFeaturedIds.filter((itemId) => Number(itemId) !== id);
          await env.DB.prepare(
            "UPDATE rstk_site_content SET content_json = ?, updated_at = CURRENT_TIMESTAMP WHERE section_key = 'settings'"
          )
            .bind(JSON.stringify(settings))
            .run();
        }
      } catch {
        // Non-fatal
      }
    }

    return jsonResponse({ success: true, message: 'Disco removido do catálogo.' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
