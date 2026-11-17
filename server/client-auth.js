/**
 * Client (B2B Reseller) Authentication & Session helpers
 * for RSTK Cloudflare Pages Functions.
 */

import { jsonResponse } from './auth.js';

export { jsonResponse };

export async function hashPassword(password) {
  const bytes = new TextEncoder().encode(String(password));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateToken(length = 32) {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export function buildClientSessionCookie(token, requestUrl, maxAgeSeconds = 60 * 60 * 24 * 30) {
  const isHttps = new URL(requestUrl).protocol === 'https:';
  const parts = [
    `rstk_client_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function clearClientSessionCookie(requestUrl) {
  return buildClientSessionCookie('', requestUrl, 0);
}

export async function verifyTurnstile(token, clientIp, env) {
  const secret = env?.TURNSTILE_SECRET_KEY || '0x4AAAAAADN7xoCAAz5NV-OPnZz92mxahL4';
  if (!secret) return { success: true }; // Se não configurado, ignora em dev local
  if (!token) return { success: false, error: 'Complete a verificação de segurança Turnstile.' };

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: clientIp || '127.0.0.1'
      })
    });
    const data = await res.json();
    return { success: Boolean(data?.success), error: data?.['error-codes']?.join(', ') || 'Falha na verificação de segurança.' };
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return { success: false, error: 'Erro ao conectar ao serviço de verificação Cloudflare.' };
  }
}

export async function getAuthenticatedClient(request, env) {
  if (!env?.DB) return null;
  const cookies = parseCookies(request);
  const token = cookies.rstk_client_session;
  if (!token) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT 
      c.id, c.cnpj, c.razao_social, c.nome_fantasia, c.ie, c.ie_isento,
      c.responsavel_nome, c.email, c.telefone, c.cep, c.logradouro,
      c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.addresses_json,
      c.status, c.email_verified, c.created_at
     FROM rstk_customer_sessions s
     JOIN rstk_customers c ON c.id = s.customer_id
     WHERE s.token = ? AND s.expires_at > ?`
  )
    .bind(token, nowSeconds)
    .first();

  if (!row) return null;

  let additionalAddresses = [];
  try {
    additionalAddresses = row.addresses_json ? JSON.parse(row.addresses_json) : [];
  } catch {
    additionalAddresses = [];
  }

  return {
    id: Number(row.id),
    cnpj: row.cnpj,
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia || '',
    ie: row.ie || '',
    ieIsento: Boolean(row.ie_isento),
    responsavelNome: row.responsavel_nome,
    email: row.email,
    telefone: row.telefone,
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
    status: row.status,
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at
  };
}

export async function requireClientAuth(request, env) {
  const client = await getAuthenticatedClient(request, env);
  if (!client) {
    return {
      client: null,
      response: jsonResponse({ success: false, error: 'Sessão expirada. Faça login novamente.' }, 401)
    };
  }
  return { client, response: null };
}

export function cleanDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

export function formatCNPJ(cnpj) {
  const d = cleanDigits(cnpj);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function formatPhone(phone) {
  const d = cleanDigits(phone);
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  return phone;
}
