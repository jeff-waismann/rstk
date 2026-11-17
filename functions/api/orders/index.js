import {
  jsonResponse,
  requireAuth,
  sanitizeUrlPath
} from '../../../server/auth.js';
import { getAuthenticatedClient } from '../../../server/client-auth.js';
import {
  sendEmail,
  buildOrderApprovedEmail,
  buildOrderChangedEmail
} from '../../../server/email.js';

function generateOrderNumber() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PED-${year}${month}${day}-${rand}`;
}

function formatBRL(cents) {
  const num = (Number(cents) || 0) / 100;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

    // Identifica se há cliente logado via sessão
    const client = await getAuthenticatedClient(request, env).catch(() => null);
    const customerId = client?.id || null;
    const customerCnpj = client?.cnpj || null;
    const customerName = client ? (client.nomeFantasia || client.razaoSocial) : null;
    const customerEmail = client?.email || null;

    // 1. Grava o pedido no D1
    const insertRes = await env.DB.prepare(
      `INSERT INTO rstk_orders (
        order_number, customer_id, customer_cnpj, customer_name, customer_email,
        items_json, total_cents, item_count, status, origin, user_agent, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'whatsapp_aberto', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
      .bind(
        orderNumber,
        customerId,
        customerCnpj,
        customerName,
        customerEmail,
        JSON.stringify(items),
        totalCents,
        itemCount,
        origin,
        userAgent,
        notes
      )
      .run();

    const orderId = insertRes.meta?.last_row_id;

    // 2. Baixa de estoque
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
        customerId,
        customerName,
        customerCnpj,
        status: 'whatsapp_aberto',
        items
      }
    }, 201);
  } catch (err) {
    console.error('Order creation error:', err);
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
    const customerType = url.searchParams.get('customerType'); // 'registered' | 'guest'
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));

    let query = 'SELECT * FROM rstk_orders';
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (customerType === 'registered') {
      conditions.push('customer_id IS NOT NULL');
    } else if (customerType === 'guest') {
      conditions.push('customer_id IS NULL');
    }

    if (search) {
      conditions.push('(order_number LIKE ? OR items_json LIKE ? OR notes LIKE ? OR customer_name LIKE ? OR customer_cnpj LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
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

      let changes = null;
      try {
        changes = row.changes_json ? JSON.parse(row.changes_json) : null;
      } catch {
        changes = null;
      }

      return {
        id: Number(row.id),
        orderNumber: row.order_number,
        customerId: row.customer_id ? Number(row.customer_id) : null,
        customerCnpj: row.customer_cnpj || null,
        customerName: row.customer_name || null,
        customerEmail: row.customer_email || null,
        items,
        totalCents: Number(row.total_cents) || 0,
        itemCount: Number(row.item_count) || items.length,
        status: row.status,
        origin: row.origin,
        userAgent: row.user_agent,
        notes: row.notes,
        changes,
        approvedAt: row.approved_at,
        adminNotes: row.admin_notes,
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
    const nextAdminNotes = body.adminNotes !== undefined ? String(body.adminNotes).trim() : existing.admin_notes;

    let itemsJson = existing.items_json;
    let totalCents = Number(existing.total_cents) || 0;
    let itemCount = Number(existing.item_count) || 0;
    let changesJson = existing.changes_json;
    let approvedAt = existing.approved_at;

    // Se o admin aprovou o pedido
    if (nextStatus === 'aprovado' || nextStatus === 'confirmado') {
      if (!approvedAt) {
        approvedAt = new Date().toISOString();
      }
    }

    // Se o admin alterou itens / quantidades
    let itemsWereChanged = false;
    if (Array.isArray(body.items)) {
      itemsJson = JSON.stringify(body.items);
      itemCount = body.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      const computedTotal = body.items.reduce((s, it) => s + ((Number(it.priceCents) || 18999) * (Number(it.quantity) || 0)), 0);
      totalCents = Number.isFinite(Number(body.totalCents)) ? Math.round(Number(body.totalCents)) : computedTotal;

      if (body.changes) {
        changesJson = JSON.stringify(body.changes);
        itemsWereChanged = true;
      }
    }

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
        admin_notes = ?,
        items_json = ?,
        total_cents = ?,
        item_count = ?,
        changes_json = ?,
        approved_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    )
      .bind(
        nextStatus,
        nextNotes,
        nextAdminNotes,
        itemsJson,
        totalCents,
        itemCount,
        changesJson,
        approvedAt,
        id
      )
      .run();

    // Notificações por e-mail para o cliente cadastrado
    if (existing.customer_email) {
      const companyName = existing.customer_name || 'Lojista Parceiro';
      const orderUrl = `https://rstk.com.br/cliente/pedidos`;
      const totalFormatted = formatBRL(totalCents);

      // 1. Notificação de aprovação
      if ((nextStatus === 'aprovado' || nextStatus === 'confirmado') && existing.status !== nextStatus) {
        const emailData = buildOrderApprovedEmail({
          companyName,
          orderNumber: existing.order_number,
          totalFormatted,
          orderUrl
        });
        await sendEmail({
          to: existing.customer_email,
          subject: emailData.subject,
          htmlText: emailData.htmlText,
          plainText: emailData.plainText,
          env
        });
      }
      // 2. Notificação de alterações de itens / valores
      else if (itemsWereChanged) {
        const emailData = buildOrderChangedEmail({
          companyName,
          orderNumber: existing.order_number,
          totalFormatted,
          notes: nextAdminNotes || nextNotes,
          orderUrl
        });
        await sendEmail({
          to: existing.customer_email,
          subject: emailData.subject,
          htmlText: emailData.htmlText,
          plainText: emailData.plainText,
          env
        });
      }
    }

    const updated = await env.DB.prepare('SELECT * FROM rstk_orders WHERE id = ?')
      .bind(id)
      .first();

    let items = [];
    try {
      items = JSON.parse(updated.items_json);
    } catch {
      items = [];
    }

    let parsedChanges = null;
    try {
      parsedChanges = updated.changes_json ? JSON.parse(updated.changes_json) : null;
    } catch {
      parsedChanges = null;
    }

    return jsonResponse({
      success: true,
      order: {
        id: Number(updated.id),
        orderNumber: updated.order_number,
        customerId: updated.customer_id ? Number(updated.customer_id) : null,
        customerCnpj: updated.customer_cnpj,
        customerName: updated.customer_name,
        customerEmail: updated.customer_email,
        items,
        totalCents: Number(updated.total_cents) || 0,
        itemCount: Number(updated.item_count) || items.length,
        status: updated.status,
        origin: updated.origin,
        notes: updated.notes,
        adminNotes: updated.admin_notes,
        changes: parsedChanges,
        approvedAt: updated.approved_at,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
    });
  } catch (err) {
    console.error('Order update error:', err);
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
