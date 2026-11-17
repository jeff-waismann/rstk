import {
  jsonResponse,
  requireClientAuth
} from '../../../server/client-auth.js';

export async function onRequestPost({ request, env }) {
  const auth = await requireClientAuth(request, env);
  if (auth.response) return auth.response;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const body = await request.json().catch(() => ({}));
    const orderId = Number(body?.orderId);
    const orderNumber = String(body?.orderNumber || '').trim();

    if (!orderId && !orderNumber) {
      return jsonResponse({ success: false, error: 'Identificador do pedido não fornecido.' }, 400);
    }

    const client = auth.client;

    const order = await env.DB.prepare(
      `SELECT id, order_number, status, changes_json, client_approved_at
       FROM rstk_orders
       WHERE (id = ? OR order_number = ?)
         AND (customer_id = ? OR customer_cnpj = ? OR customer_email = ?)`
    )
      .bind(orderId || 0, orderNumber, client.id, client.cnpj, client.email)
      .first();

    if (!order) {
      return jsonResponse(
        { success: false, error: 'Pedido não localizado na sua conta.' },
        404
      );
    }

    if (order.client_approved_at || order.status === 'alteracoes_aceitas') {
      return jsonResponse({
        success: true,
        message: 'Você já aprovou as alterações deste pedido anteriormente!',
        status: 'alteracoes_aceitas'
      });
    }

    await env.DB.prepare(
      `UPDATE rstk_orders
       SET status = 'alteracoes_aceitas',
           client_approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(order.id)
      .run();

    return jsonResponse({
      success: true,
      message: 'Alterações aprovadas com sucesso! A equipe RSTK foi notificada para preparar o despacho.',
      orderId: order.id,
      orderNumber: order.order_number,
      status: 'alteracoes_aceitas'
    });
  } catch (err) {
    console.error('Client approve changes error:', err);
    return jsonResponse({ success: false, error: `Erro ao aprovar alterações: ${err.message}` }, 500);
  }
}
