import {
  jsonResponse,
  generateToken,
  verifyTurnstile,
  cleanDigits
} from '../../../server/client-auth.js';
import { sendEmail } from '../../../server/email.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Requisição inválida.' }, 400);
    }

    const identifier = String(body.identifier || '').trim();
    const turnstileToken = String(body.turnstileToken || '').trim();

    if (!identifier) {
      return jsonResponse({ success: false, error: 'Informe seu CNPJ ou E-mail cadastrado.' }, 400);
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    const turnstileResult = await verifyTurnstile(turnstileToken, clientIp, env);
    if (!turnstileResult.success) {
      return jsonResponse({ success: false, error: turnstileResult.error }, 400);
    }

    const cleanId = cleanDigits(identifier);
    const lowerId = identifier.toLowerCase();

    const customer = await env.DB.prepare(
      `SELECT id, razao_social, nome_fantasia, email 
       FROM rstk_customers
       WHERE LOWER(email) = ? OR REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ?`
    )
      .bind(lowerId, cleanId || 'INVALID_CNPJ')
      .first();

    // Security best practice: don't reveal whether the user exists or not, but if found, generate token & send email
    if (customer) {
      const resetToken = generateToken(32);
      const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hora de validade

      await env.DB.prepare(
        `UPDATE rstk_customers 
         SET reset_token = ?, reset_token_expires = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(resetToken, expiresAt, customer.id)
        .run();

      const resetUrl = `https://rstk.com.br/cliente/recuperar-senha?token=${resetToken}`;
      const companyName = customer.nome_fantasia || customer.razao_social;

      await sendEmail({
        to: customer.email,
        subject: 'Recuperação de Senha — RSTK Atacado',
        htmlText: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0F172A; background-color: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #006782; margin: 0; font-size: 24px;">RSTK ATACADO</h1>
              <p style="color: #64748B; font-size: 14px; margin-top: 4px;">Recuperação de Acesso</p>
            </div>
            <div style="background: #FFFFFF; border-radius: 8px; padding: 24px; border: 1px solid #E2E8F0;">
              <h2 style="font-size: 18px; color: #0F172A; margin-top: 0;">Olá, ${companyName}!</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #334155;">
                Recebemos uma solicitação para redefinir a senha da sua conta B2B na RSTK Atacado.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #00C6F7; color: #0F172A; font-weight: bold; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block; font-size: 15px;">
                  Redefinir Minha Senha →
                </a>
              </div>
              <p style="font-size: 13px; color: #64748B;">
                Este link é válido por 1 hora. Se você não solicitou a troca de senha, pode desconsiderar esta mensagem.
              </p>
            </div>
          </div>
        `,
        plainText: `Olá, ${companyName}!\n\nPara redefinir sua senha na RSTK Atacado, acesse o link:\n${resetUrl}\n\nLink válido por 1 hora.`,
        env
      });
    }

    return jsonResponse({
      success: true,
      message: 'Se o CNPJ ou e-mail informado estiver cadastrado, enviamos as instruções para recuperação de senha.'
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return jsonResponse({ success: false, error: 'Erro ao processar solicitação.' }, 500);
  }
}
