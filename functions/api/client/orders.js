import {
  jsonResponse,
  requireClientAuth
} from '../../../server/client-auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireClientAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const client = auth.client;

    const { results } = await env.DB.prepare(
      `SELECT 
        id, order_number, items_json, total_cents, item_count,
        status, origin, notes, changes_json, approved_at, admin_notes,
        created_at, updated_at
       FROM rstk_orders
       WHERE customer_id = ? OR customer_cnpj = ? OR customer_email = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100`
    )
      .bind(client.id, client.cnpj, client.email)
      .all();

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
        items,
        totalCents: Number(row.total_cents) || 0,
        itemCount: Number(row.item_count) || items.length,
        status: row.status,
        origin: row.origin,
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
    console.error('Customer orders fetch error:', err);
    return jsonResponse({ success: false, error: 'Erro ao buscar pedidos.' }, 500);
  }
}
