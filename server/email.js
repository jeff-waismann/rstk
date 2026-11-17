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

  // Se houver integração com Resend, MailChannels ou SendGrid via env
  if (env?.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'RSTK Atacado <pedidos@rstk.com.br>',
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
        `INSERT INTO rstk_email_logs (recipient, subject, body_preview, status, provider, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
        .bind(recipient, title, preview, status, provider, errorMessage)
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
