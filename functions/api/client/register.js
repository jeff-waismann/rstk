import {
  jsonResponse,
  hashPassword,
  generateToken,
  buildClientSessionCookie,
  verifyTurnstile,
  cleanDigits,
  formatCNPJ,
  formatPhone
} from '../../../server/client-auth.js';
import { sendEmail, buildAccountVerificationEmail } from '../../../server/email.js';

function isValidCNPJDigits(cnpj) {
  const d = cleanDigits(cnpj);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  let size = d.length - 2;
  let numbers = d.substring(0, size);
  const digits = d.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(digits.charAt(0))) return false;

  size = size + 1;
  numbers = d.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(digits.charAt(1))) return false;

  return true;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Banco de dados D1 não configurado.' }, 503);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: 'Dados cadastrais inválidos.' }, 400);
    }

    const razaoSocial = String(body.razaoSocial || '').trim().slice(0, 200);
    const nomeFantasia = String(body.nomeFantasia || '').trim().slice(0, 200);
    const rawCnpj = String(body.cnpj || '').trim();
    const cleanCnpj = cleanDigits(rawCnpj);
    const formattedCnpj = formatCNPJ(cleanCnpj);

    const ie = String(body.ie || '').trim().slice(0, 50);
    const ieIsento = Boolean(body.ieIsento);

    const responsavelNome = String(body.responsavelNome || '').trim().slice(0, 150);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 150);
    const rawTelefone = String(body.telefone || '').trim();
    const cleanTel = cleanDigits(rawTelefone);
    const formattedTel = formatPhone(cleanTel);

    // Endereço Principal
    const cep = cleanDigits(body.cep || '').slice(0, 8);
    const logradouro = String(body.logradouro || '').trim().slice(0, 200);
    const numero = String(body.numero || '').trim().slice(0, 50);
    const complemento = String(body.complemento || '').trim().slice(0, 100);
    const bairro = String(body.bairro || '').trim().slice(0, 100);
    const cidade = String(body.cidade || '').trim().slice(0, 100);
    const uf = String(body.uf || '').trim().toUpperCase().slice(0, 2);

    // Endereços Adicionais de Entrega
    const rawAdditionalAddresses = Array.isArray(body.additionalAddresses) ? body.additionalAddresses : [];
    const additionalAddresses = rawAdditionalAddresses
      .filter((addr) => addr && (addr.logradouro || addr.cidade))
      .map((addr) => ({
        label: String(addr.label || 'Endereço Adicional').trim().slice(0, 100),
        cep: cleanDigits(addr.cep || '').slice(0, 8),
        logradouro: String(addr.logradouro || '').trim().slice(0, 200),
        numero: String(addr.numero || '').trim().slice(0, 50),
        complemento: String(addr.complemento || '').trim().slice(0, 100),
        bairro: String(addr.bairro || '').trim().slice(0, 100),
        cidade: String(addr.cidade || '').trim().slice(0, 100),
        uf: String(addr.uf || '').trim().toUpperCase().slice(0, 2)
      }));

    const password = String(body.password || '');
    const turnstileToken = String(body.turnstileToken || '').trim();

    // Validações obrigatórias
    if (!razaoSocial) {
      return jsonResponse({ success: false, error: 'Razão Social é obrigatória.' }, 400);
    }
    if (!isValidCNPJDigits(cleanCnpj)) {
      return jsonResponse({ success: false, error: 'CNPJ inválido. Verifique os 14 dígitos.' }, 400);
    }
    if (!ieIsento && !ie) {
      return jsonResponse({ success: false, error: 'Informe a Inscrição Estadual ou marque "Isento".' }, 400);
    }
    if (!responsavelNome) {
      return jsonResponse({ success: false, error: 'Nome do responsável é obrigatório.' }, 400);
    }
    if (!email || !email.includes('@') || !email.includes('.')) {
      return jsonResponse({ success: false, error: 'E-mail de contato do responsável inválido.' }, 400);
    }
    if (cleanTel.length < 10) {
      return jsonResponse({ success: false, error: 'Telefone/WhatsApp com DDD é obrigatório.' }, 400);
    }
    if (cep.length !== 8 || !logradouro || !numero || !cidade || !uf) {
      return jsonResponse({ success: false, error: 'Preencha o endereço completo (CEP, rua, número, cidade e UF).' }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ success: false, error: 'A senha deve conter no mínimo 6 caracteres.' }, 400);
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    // Anti-bot Turnstile
    const turnstileResult = await verifyTurnstile(turnstileToken, clientIp, env);
    if (!turnstileResult.success) {
      return jsonResponse({ success: false, error: turnstileResult.error }, 400);
    }

    // Verifica duplicidade de CNPJ ou E-mail
    const existing = await env.DB.prepare(
      `SELECT id, cnpj, email FROM rstk_customers 
       WHERE LOWER(email) = ? OR REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '-', ''), '/', '') = ?`
    )
      .bind(email, cleanCnpj)
      .first();

    if (existing) {
      if (existing.email.toLowerCase() === email) {
        return jsonResponse(
          { success: false, error: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.' },
          409
        );
      }
      return jsonResponse(
        { success: false, error: 'Este CNPJ já está cadastrado. Faça login ou solicite recuperação de acesso.' },
        409
      );
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = generateToken(32);

    const insertResult = await env.DB.prepare(
      `INSERT INTO rstk_customers (
        cnpj, razao_social, nome_fantasia, ie, ie_isento,
        responsavel_nome, email, telefone, password_hash,
        cep, logradouro, numero, complemento, bairro, cidade, uf,
        addresses_json, status, email_verified, verification_token,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, 'active', 0, ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`
    )
      .bind(
        formattedCnpj,
        razaoSocial,
        nomeFantasia,
        ieIsento ? 'ISENTO' : ie,
        ieIsento ? 1 : 0,
        responsavelNome,
        email,
        formattedTel,
        passwordHash,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        JSON.stringify(additionalAddresses),
        verificationToken
      )
      .run();

    const customerId = insertResult.meta?.last_row_id;

    // Dispara e-mail de confirmação (com log auditável no D1)
    const siteUrl = 'https://rstk.com.br';
    const verifyUrl = `${siteUrl}/cliente/verificar?token=${verificationToken}`;
    const mailContent = buildAccountVerificationEmail({
      companyName: nomeFantasia || razaoSocial,
      verifyUrl
    });

    await sendEmail({
      to: email,
      subject: mailContent.subject,
      htmlText: mailContent.htmlText,
      plainText: mailContent.plainText,
      env
    });

    // Cria sessão do cliente e efetua login automático
    const sessionToken = generateToken(32);
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + 30 * 24 * 60 * 60;
    const userAgent = (request.headers.get('user-agent') || '').slice(0, 255);

    await env.DB.prepare(
      `INSERT INTO rstk_customer_sessions (customer_id, token, ip, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(customerId, sessionToken, clientIp, userAgent, expiresAt)
      .run();

    const cookieHeader = buildClientSessionCookie(sessionToken, request.url, 30 * 24 * 60 * 60);

    return jsonResponse(
      {
        success: true,
        message: 'Cadastro realizado com sucesso! Um e-mail de confirmação foi enviado.',
        customer: {
          id: customerId,
          razaoSocial,
          nomeFantasia,
          cnpj: formattedCnpj,
          email,
          responsavelNome,
          emailVerified: false
        }
      },
      201,
      { 'Set-Cookie': cookieHeader }
    );
  } catch (err) {
    console.error('Customer registration error:', err);
    return jsonResponse({ success: false, error: `Erro ao realizar cadastro: ${err.message}` }, 500);
  }
}
