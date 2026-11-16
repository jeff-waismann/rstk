import {
  jsonResponse,
  requireAuth,
  sanitizeUrlPath
} from '../../../server/auth.js';

function generateOrderNumber() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PED-${year}${month}${day}-${rand}`;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Payload de pedido inválido.' }, 400);
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems.map((item) => {
      const id = Number(item.id) || null;
      const title = String(item.title || 'Disco de Vinil').trim().slice(0, 200);
      const artist = String(item.artist || 'Artista').trim().slice(0, 200);
      const units = Number(item.units) || 1;
      const priceCents = Number.isFinite(Number(item.priceCents)) ? Math.round(Number(item.priceCents)) : 18999;
      const quantity = Math.max(1, Math.min(99, Math.round(Number(item.quantity) || 1)));
      const cover = sanitizeUrlPath(item.cover || item.coverUrl || '', '');

      return {
        id,
        title,
        artist,
        units,
        priceCents,
        quantity,
        cover
      };
    });

    const itemCount = items.reduce((sum, it) => sum + it.quantity, 0);
    const computedTotal = items.reduce((sum, it) => sum + (it.priceCents * it.quantity), 0);
    const totalCents = Number.isFinite(Number(body.totalCents)) && Number(body.totalCents) > 0
      ? Math.round(Number(body.totalCents))
      : (computedTotal || 18999);

    const orderNumber = generateOrderNumber();
    const origin = String(body.origin || 'whatsapp_catalog').slice(0, 50);
    const userAgent = (request.headers.get('user-agent') || '').slice(0, 255);
    const notes = String(body.notes || (items.length ? 'Iniciado via clique WhatsApp no catálogo' : 'Consulta geral')).slice(0, 500);

    // 1. Grava o pedido no D1
    const insertRes = await env.DB.prepare(
      `INSERT INTO rstk_orders (
        order_number, items_json, total_cents, item_count, status, origin, user_agent, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'whatsapp_aberto', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
      .bind(
        orderNumber,
        JSON.stringify(items),
        totalCents,
        itemCount,
        origin,
        userAgent,
        notes
      )
      .run();

    const orderId = insertRes.meta?.last_row_id;

    // 2. Dá baixa no estoque para cada item do pedido
    // "não tire do site se o estoque acabar, por enquanto é só um teste"
    for (const item of items) {
      if (item.id) {
        await env.DB.prepare(
          `UPDATE rstk_products
           SET stock = MAX(0, stock - ?),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
          .bind(item.quantity, item.id)
          .run();
      }
    }

    return jsonResponse({
      success: true,
      order: {
        id: orderId,
        orderNumber,
        itemCount,
        totalCents,
        status: 'whatsapp_aberto',
        items
      }
    }, 201);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));

    let query = 'SELECT * FROM rstk_orders';
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(order_number LIKE ? OR items_json LIKE ? OR notes LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (conditions.length) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC, id DESC LIMIT ?';
    params.push(limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    const orders = (results || []).map((row) => {
      let items = [];
      try {
        items = JSON.parse(row.items_json);
      } catch {
        items = [];
      }

      return {
        id: Number(row.id),
        orderNumber: row.order_number,
        items,
        totalCents: Number(row.total_cents) || 0,
        itemCount: Number(row.item_count) || items.length,
        status: row.status,
        origin: row.origin,
        userAgent: row.user_agent,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    return jsonResponse({
      success: true,
      orders
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return jsonResponse({ success: false, error: 'ID do pedido é obrigatório.' }, 400);
    }

    const id = Number(body.id);
    const existing = await env.DB.prepare('SELECT * FROM rstk_orders WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ success: false, error: 'Pedido não encontrado.' }, 404);
    }

    const nextStatus = body.status ? String(body.status).trim() : existing.status;
    const nextNotes = body.notes !== undefined ? String(body.notes).trim() : existing.notes;

    // Se o pedido for cancelado e restoreStock for true, devolver os itens ao estoque
    if (body.restoreStock && existing.status !== 'cancelado' && nextStatus === 'cancelado') {
      try {
        const items = JSON.parse(existing.items_json || '[]');
        for (const it of items) {
          if (it.id) {
            await env.DB.prepare(
              'UPDATE rstk_products SET stock = stock + ? WHERE id = ?'
            )
              .bind(it.quantity || 1, it.id)
              .run();
          }
        }
      } catch {
        // ignora se JSON corrompido
      }
    }

    await env.DB.prepare(
      `UPDATE rstk_orders SET
        status = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    )
      .bind(nextStatus, nextNotes, id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM rstk_orders WHERE id = ?')
      .bind(id)
      .first();

    let items = [];
    try {
      items = JSON.parse(updated.items_json);
    } catch {
      items = [];
    }

    return jsonResponse({
      success: true,
      order: {
        id: Number(updated.id),
        orderNumber: updated.order_number,
        items,
        totalCents: Number(updated.total_cents) || 0,
        itemCount: Number(updated.item_count) || items.length,
        status: updated.status,
        origin: updated.origin,
        notes: updated.notes,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
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
      return jsonResponse({ success: false, error: 'ID do pedido é obrigatório.' }, 400);
    }

    await env.DB.prepare('DELETE FROM rstk_orders WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, deletedId: id });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
