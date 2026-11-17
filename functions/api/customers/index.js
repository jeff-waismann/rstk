import { jsonResponse, requireAuth } from '../../../server/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const url = new URL(request.url);
    const search = (url.searchParams.get('search') || '').trim();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));

    let query = `
      SELECT 
        c.id,
        c.cnpj,
        c.razao_social,
        c.nome_fantasia,
        c.ie,
        c.inscricao_estadual,
        c.ie_isento,
        c.responsavel_nome,
        c.responsible_name,
        c.email,
        c.telefone,
        c.phone,
        c.cep,
        c.logradouro,
        c.numero,
        c.complemento,
        c.bairro,
        c.cidade,
        c.uf,
        c.addresses_json,
        c.status,
        c.email_verified,
        c.created_at,
        c.updated_at,
        COUNT(o.id) AS orders_count,
        COALESCE(SUM(o.total_cents), 0) AS total_spent_cents,
        MAX(o.created_at) AS last_order_at
      FROM rstk_customers c
      LEFT JOIN rstk_orders o ON (o.customer_id = c.id OR (o.customer_id IS NULL AND o.customer_cnpj = c.cnpj))
    `;

    const params = [];
    if (search) {
      query += ` WHERE (
        c.razao_social LIKE ? OR 
        c.nome_fantasia LIKE ? OR 
        c.cnpj LIKE ? OR 
        c.email LIKE ? OR 
        c.responsavel_nome LIKE ? OR 
        c.telefone LIKE ? OR 
        c.cidade LIKE ?
      )`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s, s);
    }

    query += ' GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?';
    params.push(limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Também buscamos todos os pedidos para vincular o histórico detalhado
    const ordersRes = await env.DB.prepare(
      `SELECT id, order_number, customer_id, customer_cnpj, items_json, total_cents, item_count, status, created_at 
       FROM rstk_orders 
       ORDER BY created_at DESC LIMIT 500`
    ).all().catch(() => ({ results: [] }));

    const allOrders = ordersRes.results || [];

    const customers = (results || []).map((row) => {
      let additionalAddresses = [];
      try {
        additionalAddresses = row.addresses_json ? JSON.parse(row.addresses_json) : [];
      } catch {
        additionalAddresses = [];
      }

      // Filtra os pedidos específicos deste cliente
      const customerOrders = allOrders.filter(
        (o) => (o.customer_id && Number(o.customer_id) === Number(row.id)) || (o.customer_cnpj && o.customer_cnpj === row.cnpj)
      ).map((o) => {
        let items = [];
        try {
          items = JSON.parse(o.items_json);
        } catch {
          items = [];
        }
        return {
          id: Number(o.id),
          orderNumber: o.order_number,
          totalCents: Number(o.total_cents) || 0,
          itemCount: Number(o.item_count) || items.length,
          status: o.status,
          createdAt: o.created_at,
          itemsSummary: items.slice(0, 3).map((it) => it.title || 'Disco').join(', ') + (items.length > 3 ? ` (+${items.length - 3})` : '')
        };
      });

      return {
        id: Number(row.id),
        cnpj: row.cnpj,
        razaoSocial: row.razao_social,
        nomeFantasia: row.nome_fantasia || row.razao_social,
        ie: row.ie || row.inscricao_estadual || (row.ie_isento ? 'ISENTO' : '—'),
        ieIsento: Boolean(row.ie_isento),
        responsavelNome: row.responsavel_nome || row.responsible_name,
        email: row.email,
        telefone: row.telefone || row.phone,
        address: {
          cep: row.cep || '',
          logradouro: row.logradouro || '',
          numero: row.numero || '',
          complemento: row.complemento || '',
          bairro: row.bairro || '',
          cidade: row.cidade || '',
          uf: row.uf || ''
        },
        additionalAddresses,
        status: row.status || 'active',
        emailVerified: Boolean(row.email_verified),
        ordersCount: Number(row.orders_count) || customerOrders.length,
        totalSpentCents: Number(row.total_spent_cents) || 0,
        lastOrderAt: row.last_order_at,
        orders: customerOrders,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    return jsonResponse({
      success: true,
      customers
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
