import {
  jsonResponse,
  generateToken,
  getAuthenticatedClient
} from '../../../server/client-auth.js';
import {
  sendEmail,
  buildAccountVerificationEmail
} from '../../../server/email.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const body = await request.json().catch(() => ({}));
    const reqEmail = String(body?.email || '').trim().toLowerCase();
    const reqCnpj = String(body?.cnpj || '').replace(/\D/g, '');

    let customer = null;

    // 1. Tenta identificar por sessão ativa
    const authClient = await getAuthenticatedClient(request, env).catch(() => null);
    if (authClient) {
      customer = await env.DB.prepare(
        'SELECT id, cnpj, razao_social, nome_fantasia, email, email_verified, verification_token FROM rstk_customers WHERE id = ?'
      )
        .bind(authClient.id)
        .first();
    }

    // 2. Tenta identificar por e-mail ou CNPJ fornecido
    if (!customer && reqEmail) {
      customer = await env.DB.prepare(
        'SELECT id, cnpj, razao_social, nome_fantasia, email, email_verified, verification_token FROM rstk_customers WHERE LOWER(email) = ?'
      )
        .bind(reqEmail)
        .first();
    }

    if (!customer && reqCnpj) {
      customer = await env.DB.prepare(
        `SELECT id, cnpj, razao_social, nome_fantasia, email, email_verified, verification_token FROM rstk_customers 
         WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ?`
      )
        .bind(reqCnpj)
        .first();
    }

    if (!customer) {
      return jsonResponse(
        { success: false, error: 'Cadastro não localizado. Verifique os dados ou faça um novo cadastro.' },
        404
      );
    }

    if (customer.email_verified) {
      return jsonResponse({
        success: true,
        message: 'O e-mail desta conta já está confirmado!'
      });
    }

    // Garante token válido
    let verificationToken = customer.verification_token;
    if (!verificationToken) {
      verificationToken = generateToken(32);
      await env.DB.prepare(
        'UPDATE rstk_customers SET verification_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
        .bind(verificationToken, customer.id)
        .run();
    }

    const siteUrl = 'https://rstk.com.br';
    const verifyUrl = `${siteUrl}/cliente/verificar?token=${verificationToken}`;
    const mailContent = buildAccountVerificationEmail({
      companyName: customer.nome_fantasia || customer.razao_social,
      verifyUrl
    });

    const emailRes = await sendEmail({
      to: customer.email,
      subject: mailContent.subject,
      htmlText: mailContent.htmlText,
      plainText: mailContent.plainText,
      env
    });

    return jsonResponse({
      success: true,
      message: `E-mail de confirmação reenviado para ${customer.email}!`,
      provider: emailRes.provider,
      status: emailRes.status
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    return jsonResponse({ success: false, error: `Erro ao reenviar confirmação: ${err.message}` }, 500);
  }
}
