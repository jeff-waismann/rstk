/**
 * Transactional Email Dispatch & Audit Logger for RSTK
 * Logs all sent messages to D1 `rstk_email_logs` table (Rule 6).
 */

export async function sendEmail({ to, subject, htmlText, plainText, env }) {
  const recipient = String(to || '').trim().toLowerCase();
  const title = String(subject || '').trim();
  const preview = (plainText || htmlText || '').slice(0, 300);

  let status = 'logged';
  let provider = 'rstk_logger';
  let errorMessage = null;

  // 1. Integração oficial com Zoho ZeptoMail (api.zeptomail.com)
  const zeptoKey = env?.ZEPTO_API_KEY || env?.ZEPTOMAIL_API_KEY || env?.ZEPTO_TOKEN;
  if (zeptoKey) {
    try {
      const rawKey = String(zeptoKey).trim();
      const authHeader = rawKey.startsWith('Zoho-enczapikey')
        ? rawKey
        : `Zoho-enczapikey ${rawKey}`;

      const payload = {
        from: {
          address: 'naoresponda@smartweb.net.br',
          name: 'RSTK Atacado'
        },
        to: [
          {
            email_address: {
              address: recipient,
              name: recipient.split('@')[0]
            }
          }
        ],
        subject: title,
        htmlbody: htmlText,
        textbody: plainText
      };

      const res = await fetch('https://api.zeptomail.com/v1.1/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        status = 'sent';
        provider = 'zeptomail';
      } else {
        const errData = await res.json().catch(() => ({}));
        status = 'failed';
        provider = 'zeptomail';
        errorMessage = JSON.stringify(errData);
      }
    } catch (err) {
      status = 'failed';
      provider = 'zeptomail';
      errorMessage = err.message;
    }
  }
  // 2. Fallback alternativo para Resend se configurado
  else if (env?.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'RSTK Atacado <naoresponda@smartweb.net.br>',
          to: [recipient],
          subject: title,
          html: htmlText,
          text: plainText
        })
      });
      if (res.ok) {
        status = 'sent';
        provider = 'resend';
      } else {
        const errData = await res.json().catch(() => ({}));
        status = 'failed';
        provider = 'resend';
        errorMessage = JSON.stringify(errData);
      }
    } catch (err) {
      status = 'failed';
      provider = 'resend';
      errorMessage = err.message;
    }
  }

  // Registra no banco D1 para auditoria e histórico de entregabilidade
  if (env?.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO rstk_email_logs (to_email, subject, body_html, email_type, status, provider, error_message, metadata_json, created_at)
         VALUES (?, ?, ?, 'transactional', ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
        .bind(
          recipient,
          title,
          htmlText || plainText || '',
          status,
          provider,
          errorMessage,
          JSON.stringify({ plainPreview: preview })
        )
        .run();
    } catch (dbErr) {
      console.error('Falha ao registrar log de email no D1:', dbErr);
    }
  }

  return { success: status !== 'failed', status, provider };
}

export function buildAccountVerificationEmail({ companyName, verifyUrl }) {
  return {
    subject: 'Confirmação de Cadastro — RSTK Atacado de Vinis',
    htmlText: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0F172A; background-color: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #006782; margin: 0; font-size: 24px;">RSTK ATACADO</h1>
          <p style="color: #64748B; font-size: 14px; margin-top: 4px;">Portal do Lojista e Revenda B2B</p>
        </div>
        <div style="background: #FFFFFF; border-radius: 8px; padding: 24px; border: 1px solid #E2E8F0;">
          <h2 style="font-size: 18px; color: #0F172A; margin-top: 0;">Olá, ${companyName}!</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">
            Seu cadastro como revenda na RSTK foi recebido com sucesso. Para confirmar seu endereço de e-mail e ativar todas as notificações de pedidos da sua empresa, clique no botão abaixo:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="background-color: #00C6F7; color: #0F172A; font-weight: bold; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-size: 15px;">
              Confirmar Meu E-mail →
            </a>
          </div>
          <p style="font-size: 13px; color: #64748B; line-height: 1.5;">
            Caso não consiga clicar no botão, copie e cole o link a seguir no seu navegador:<br/>
            <a href="${verifyUrl}" style="color: #006782; word-break: break-all;">${verifyUrl}</a>
          </p>
        </div>
        <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #94A3B8;">
          © ${new Date().getFullYear()} RSTK Atacado de Vinis · Distribuindo raridades e lançamentos em vinil.
        </div>
      </div>
    `,
    plainText: `Olá, ${companyName}!\n\nSeu cadastro na RSTK foi recebido com sucesso.\n\nConfirme seu e-mail acessando o link:\n${verifyUrl}\n\nAtenciosamente,\nEquipe RSTK Atacado`
  };
}

export function buildOrderApprovedEmail({ companyName, orderNumber, totalFormatted, orderUrl }) {
  return {
    subject: `Pedido #${orderNumber} Aprovado! — RSTK Atacado`,
    htmlText: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0F172A; background-color: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #006782; margin: 0; font-size: 24px;">RSTK ATACADO</h1>
          <p style="color: #64748B; font-size: 14px; margin-top: 4px;">Portal do Lojista e Revenda B2B</p>
        </div>
        <div style="background: #FFFFFF; border-radius: 8px; padding: 24px; border: 1px solid #E2E8F0;">
          <div style="display: inline-block; background: #DCFCE7; color: #166534; font-weight: bold; padding: 4px 12px; border-radius: 999px; font-size: 13px; margin-bottom: 12px;">
            ✓ Pedido Aprovado
          </div>
          <h2 style="font-size: 18px; color: #0F172A; margin-top: 0;">Boas notícias, ${companyName}!</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">
            Seu pedido <strong>#${orderNumber}</strong> foi aprovado e validado pela equipe RSTK.
          </p>
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0; font-size: 14px; color: #64748B;">Valor Total do Pedido:</p>
            <p style="margin: 0; font-size: 22px; font-weight: 800; color: #006782;">${totalFormatted}</p>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">
            Você pode acompanhar todos os detalhes e o andamento da separação diretamente na sua Área do Cliente:
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${orderUrl}" style="background-color: #00C6F7; color: #0F172A; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-size: 14px;">
              Visualizar Pedido no Painel →
            </a>
          </div>
        </div>
        <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #94A3B8;">
          © ${new Date().getFullYear()} RSTK Atacado de Vinis
        </div>
      </div>
    `,
    plainText: `Olá, ${companyName}!\n\nSeu pedido #${orderNumber} foi aprovado pela RSTK! Total: ${totalFormatted}.\n\nAcompanhe no seu painel:\n${orderUrl}\n\nAtenciosamente,\nEquipe RSTK Atacado`
  };
}

export function buildOrderChangedEmail({ companyName, orderNumber, totalFormatted, notes, orderUrl }) {
  return {
    subject: `Atualização no Pedido #${orderNumber} — RSTK Atacado`,
    htmlText: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0F172A; background-color: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #006782; margin: 0; font-size: 24px;">RSTK ATACADO</h1>
          <p style="color: #64748B; font-size: 14px; margin-top: 4px;">Portal do Lojista e Revenda B2B</p>
        </div>
        <div style="background: #FFFFFF; border-radius: 8px; padding: 24px; border: 1px solid #E2E8F0;">
          <div style="display: inline-block; background: #FEF3C7; color: #92400E; font-weight: bold; padding: 4px 12px; border-radius: 999px; font-size: 13px; margin-bottom: 12px;">
            ⚠ Alteração no Pedido
          </div>
          <h2 style="font-size: 18px; color: #0F172A; margin-top: 0;">Olá, ${companyName}!</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">
            Houve uma atualização recente no seu pedido <strong>#${orderNumber}</strong> (por exemplo, ajuste de quantidade ou item com estoque esgotado).
          </p>
          ${notes ? `<div style="background: #FFFBEB; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 16px 0; font-size: 14px; color: #78350F;">${notes}</div>` : ''}
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0; font-size: 14px; color: #64748B;">Novo Valor Total:</p>
            <p style="margin: 0; font-size: 22px; font-weight: 800; color: #006782;">${totalFormatted}</p>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${orderUrl}" style="background-color: #00C6F7; color: #0F172A; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-size: 14px;">
              Ver Alterações no Painel →
            </a>
          </div>
        </div>
        <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #94A3B8;">
          © ${new Date().getFullYear()} RSTK Atacado de Vinis
        </div>
      </div>
    `,
    plainText: `Olá, ${companyName}!\n\nHouve uma atualização no seu pedido #${orderNumber}. Novo total: ${totalFormatted}.\n\nConfira os detalhes na sua área de cliente:\n${orderUrl}\n\nAtenciosamente,\nEquipe RSTK Atacado`
  };
}

export function buildNewOrderAdminEmail({
  orderNumber,
  customerName,
  customerCnpj,
  customerResponsible,
  customerEmail,
  customerPhone,
  deliveryAddress,
  items = [],
  totalFormatted,
  itemCount,
  notes,
  origin
}) {
  const cleanPhone = String(customerPhone || '').replace(/\D/g, '');
  const waNumber = cleanPhone ? (cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`) : null;
  const whatsappUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Olá! Aqui é da equipe RSTK Atacado. Recebemos o seu pedido #${orderNumber} e estamos conferindo os detalhes para liberação.`)}`
    : null;

  const adminPanelUrl = 'https://rstk.com.br/admin';

  const itemsRows = (items || []).map((it) => {
    const qty = Number(it.quantity) || 1;
    const unitPrice = (Number(it.priceCents) || 18999) / 100;
    const subtotal = unitPrice * qty;
    const formatBRLNum = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const coverUrl = it.cover
      ? (it.cover.startsWith('http') ? it.cover : `https://rstk.com.br${it.cover}`)
      : 'https://rstk.com.br/assets/covers/album-01.webp';
    const albumFormat = Number(it.units) === 1 ? 'Simples' : (Number(it.units) === 2 ? 'Duplo' : `${it.units || 1} LPs`);

    return `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px; width: 44px; vertical-align: middle;">
          <img src="${coverUrl}" alt="" width="44" height="44" style="border-radius: 6px; object-fit: cover; display: block; border: 1px solid #E2E8F0;" />
        </td>
        <td style="padding: 10px; vertical-align: middle;">
          <strong style="font-size: 13.5px; color: #0F172A; display: block;">${it.title || 'Disco de Vinil'}</strong>
          <span style="font-size: 12px; color: #64748B;">${it.artist || 'Artista'} · ${albumFormat}</span>
        </td>
        <td style="padding: 10px; text-align: center; vertical-align: middle; white-space: nowrap;">
          <span style="background: #F1F5F9; border: 1px solid #CBD5E1; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: #0F172A;">
            ${qty} un.
          </span>
        </td>
        <td style="padding: 10px; text-align: right; vertical-align: middle; white-space: nowrap;">
          <span style="font-size: 11px; color: #64748B; display: block;">${formatBRLNum(unitPrice)} un.</span>
          <strong style="font-size: 13px; color: #006782;">${formatBRLNum(subtotal)}</strong>
        </td>
      </tr>
    `;
  }).join('');

  const plainItemsText = (items || []).map((it) => {
    const qty = Number(it.quantity) || 1;
    const unitPrice = ((Number(it.priceCents) || 18999) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const subtotal = (((Number(it.priceCents) || 18999) * qty) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `• ${qty}x ${it.title} (${it.artist}) - ${unitPrice} un. = ${subtotal}`;
  }).join('\n');

  return {
    subject: `🔔 Novo Pedido #${orderNumber} recebido! — ${customerName || 'Cliente Catálogo'} (${totalFormatted})`,
    htmlText: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; color: #0F172A; background-color: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #006782; margin: 0; font-size: 24px; letter-spacing: 0.5px;">RSTK ATACADO</h1>
          <p style="color: #64748B; font-size: 13px; margin-top: 4px;">Notificação de Novo Pedido no Catálogo</p>
        </div>

        <!-- Card Principal -->
        <div style="background: #FFFFFF; border-radius: 10px; padding: 24px; border: 1px solid #E2E8F0; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
          <div style="margin-bottom: 16px; border-bottom: 1px solid #F1F5F9; padding-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div>
                <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748B; letter-spacing: 1px; display: block;">Pedido Recebido</span>
                <h2 style="font-size: 20px; font-weight: 800; color: #006782; margin: 2px 0 0 0; font-family: monospace;">#${orderNumber}</h2>
              </div>
              <div>
                <span style="display: inline-block; background: #DCFCE7; color: #15803D; font-weight: bold; padding: 5px 12px; border-radius: 999px; font-size: 12px; border: 1px solid #86EFAC;">
                  ● Novo Pedido
                </span>
              </div>
            </div>
          </div>

          <!-- Dados do Cliente / Revenda -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h3 style="font-size: 13px; font-weight: bold; text-transform: uppercase; color: #006782; margin: 0 0 10px 0; letter-spacing: 0.5px;">
              👤 Dados do Cliente / Revenda
            </h3>
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0; color: #64748B; width: 140px;">Loja / Razão Social:</td>
                <td style="padding: 4px 0; color: #0F172A; font-weight: bold;">${customerName || 'Cliente Catálogo (Sem cadastro prévio)'}</td>
              </tr>
              ${customerCnpj ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748B;">CNPJ:</td>
                  <td style="padding: 4px 0; color: #0F172A; font-family: monospace; font-weight: bold;">${customerCnpj}</td>
                </tr>
              ` : ''}
              ${customerResponsible ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748B;">Responsável:</td>
                  <td style="padding: 4px 0; color: #0F172A; font-weight: bold;">${customerResponsible}</td>
                </tr>
              ` : ''}
              ${customerEmail ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748B;">E-mail:</td>
                  <td style="padding: 4px 0; color: #0F172A;"><a href="mailto:${customerEmail}" style="color: #006782; text-decoration: none;">${customerEmail}</a></td>
                </tr>
              ` : ''}
              ${customerPhone ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748B;">Telefone / WhatsApp:</td>
                  <td style="padding: 4px 0; color: #0F172A; font-weight: bold;">${customerPhone}</td>
                </tr>
              ` : ''}
              ${deliveryAddress ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748B; vertical-align: top;">Endereço de Entrega:</td>
                  <td style="padding: 4px 0; color: #0F172A;">${deliveryAddress}</td>
                </tr>
              ` : ''}
              ${notes ? `
                <tr>
                  <td style="padding: 4px 0; color: #64748B; vertical-align: top;">Observações:</td>
                  <td style="padding: 4px 0; color: #0F172A; font-style: italic;">"${notes}"</td>
                </tr>
              ` : ''}
            </table>
          </div>

          <!-- Botão de Ação: WhatsApp Direto com o Cliente -->
          ${whatsappUrl ? `
            <div style="text-align: center; margin: 20px 0; padding: 16px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px;">
              <p style="margin: 0 0 10px 0; font-size: 13px; color: #166534; font-weight: 600;">
                Fale agora mesmo com o cliente no WhatsApp para confirmar o pedido:
              </p>
              <a href="${whatsappUrl}" target="_blank" style="background-color: #25D366; color: #FFFFFF; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-size: 14px; box-shadow: 0 2px 6px rgba(37,211,102,0.3);">
                💬 Chamar Cliente no WhatsApp (${customerPhone})
              </a>
            </div>
          ` : ''}

          <!-- Itens do Pedido -->
          <div style="margin-top: 24px;">
            <h3 style="font-size: 13px; font-weight: bold; text-transform: uppercase; color: #006782; margin: 0 0 12px 0; letter-spacing: 0.5px;">
              📦 Discos Solicitados (${itemCount} un.)
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: #F1F5F9; color: #64748B; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #CBD5E1;">
                  <th style="padding: 8px 10px; text-align: left;" colspan="2">Álbum / Artista</th>
                  <th style="padding: 8px 10px; text-align: center;">Qtd</th>
                  <th style="padding: 8px 10px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          </div>

          <!-- Total Financeiro -->
          <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 12px; color: #1E40AF; display: block;">Total Geral do Pedido:</span>
                <strong style="font-size: 22px; color: #1E3A8A;">${totalFormatted}</strong>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 13px; color: #1E40AF; font-weight: 600;">${itemCount} disco(s)</span>
              </div>
            </div>
          </div>

          <!-- Botão para Abrir Painel Admin -->
          <div style="text-align: center; margin-top: 24px;">
            <a href="${adminPanelUrl}" target="_blank" style="background-color: #0866c8; color: #FFFFFF; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-size: 14px;">
              Gerenciar Pedido no Painel da Loja →
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #94A3B8;">
          © ${new Date().getFullYear()} RSTK Atacado de Vinis · Painel Administrativo Smartweb
        </div>
      </div>
    `,
    plainText: `NOVO PEDIDO RECEBIDO - RSTK ATACADO\n\n` +
      `Pedido: #${orderNumber}\n` +
      `Cliente: ${customerName || 'Cliente Catálogo'}\n` +
      (customerCnpj ? `CNPJ: ${customerCnpj}\n` : '') +
      (customerResponsible ? `Responsável: ${customerResponsible}\n` : '') +
      (customerEmail ? `E-mail: ${customerEmail}\n` : '') +
      (customerPhone ? `Telefone / WhatsApp: ${customerPhone}\n` : '') +
      (deliveryAddress ? `Endereço: ${deliveryAddress}\n` : '') +
      (notes ? `Observações: ${notes}\n` : '') +
      (whatsappUrl ? `\nWhatsApp do Cliente: ${whatsappUrl}\n` : '') +
      `\nITENS DO PEDIDO:\n` +
      plainItemsText +
      `\n\nTOTAL DO PEDIDO: ${totalFormatted} (${itemCount} un.)\n\n` +
      `Gerenciar pedido no painel: ${adminPanelUrl}`
  };
}
