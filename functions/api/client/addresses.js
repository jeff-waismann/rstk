import {
  jsonResponse,
  requireClientAuth,
  getAuthenticatedClient
} from '../../../server/client-auth.js';

export async function onRequestGet({ request, env }) {
  try {
    const { client, response } = await requireClientAuth(request, env);
    if (response) return response;

    return jsonResponse({
      success: true,
      address: client.address,
      additionalAddresses: client.additionalAddresses || []
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  return handleUpdate({ request, env });
}

export async function onRequestPost({ request, env }) {
  return handleUpdate({ request, env });
}

async function handleUpdate({ request, env }) {
  try {
    const { client, response } = await requireClientAuth(request, env);
    if (response) return response;

    const body = await request.json().catch(() => ({}));

    // Atualização do endereço principal (opcional)
    let updateFields = [];
    let updateValues = [];

    if (body.principalAddress && typeof body.principalAddress === 'object') {
      const p = body.principalAddress;
      const cep = String(p.cep || '').replace(/\D/g, '').slice(0, 8);
      const logradouro = String(p.logradouro || '').trim().slice(0, 255);
      const numero = String(p.numero || '').trim().slice(0, 30);
      const complemento = String(p.complemento || '').trim().slice(0, 100);
      const bairro = String(p.bairro || '').trim().slice(0, 100);
      const cidade = String(p.cidade || '').trim().slice(0, 100);
      const uf = String(p.uf || '').trim().toUpperCase().slice(0, 2);

      updateFields.push('cep = ?', 'logradouro = ?', 'numero = ?', 'complemento = ?', 'bairro = ?', 'cidade = ?', 'uf = ?');
      updateValues.push(cep, logradouro, numero, complemento, bairro, cidade, uf);
    }

    // Atualização de filiais / endereços adicionais (opcional)
    if (Array.isArray(body.additionalAddresses)) {
      const sanitized = body.additionalAddresses.map((addr, idx) => ({
        id: addr.id || String(idx + 1),
        label: String(addr.label || `Filial ${idx + 1}`).trim().slice(0, 100),
        cep: String(addr.cep || '').replace(/\D/g, '').slice(0, 8),
        logradouro: String(addr.logradouro || '').trim().slice(0, 255),
        numero: String(addr.numero || '').trim().slice(0, 30),
        complemento: String(addr.complemento || '').trim().slice(0, 100),
        bairro: String(addr.bairro || '').trim().slice(0, 100),
        cidade: String(addr.cidade || '').trim().slice(0, 100),
        uf: String(addr.uf || '').trim().toUpperCase().slice(0, 2),
        phone: String(addr.phone || '').trim().slice(0, 20),
        contactName: String(addr.contactName || '').trim().slice(0, 100)
      }));

      updateFields.push('addresses_json = ?');
      updateValues.push(JSON.stringify(sanitized));
    }

    if (updateFields.length === 0) {
      return jsonResponse({ success: false, error: 'Nenhum dado informado para atualização.' }, 400);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(client.id);

    const query = `UPDATE rstk_customers SET ${updateFields.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query).bind(...updateValues).run();

    // Re-busca dados atualizados
    const updatedClient = await getAuthenticatedClient(request, env);

    return jsonResponse({
      success: true,
      message: 'Endereços salvos com sucesso!',
      address: updatedClient?.address,
      additionalAddresses: updatedClient?.additionalAddresses || []
    });
  } catch (err) {
    console.error('Update addresses error:', err);
    return jsonResponse({ success: false, error: err.message || 'Erro ao atualizar endereços.' }, 500);
  }
}
