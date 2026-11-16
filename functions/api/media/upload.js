import { jsonResponse, requireAuth } from '../../../server/auth.js';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

function detectMimeFromBytes(bytes, declaredMime) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'video/mp4';
  }

  const headText = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 512))
    .trim()
    .toLowerCase();
  if (
    declaredMime === 'image/svg+xml' &&
    (headText.startsWith('<svg') || (headText.startsWith('<?xml') && headText.includes('<svg')))
  ) {
    return 'image/svg+xml';
  }

  return null;
}

function sanitizeSvgBuffer(buffer) {
  let svg = new TextDecoder().decode(buffer);
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
  return new TextEncoder().encode(svg).buffer;
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  try {
    if (!env?.R2 || !env?.DB) {
      return jsonResponse(
        { success: false, error: 'Bindings R2 ou D1 não configurados.' },
        503
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return jsonResponse({ success: false, error: 'Nenhum arquivo enviado.' }, 400);
    }

    if (file.size > MAX_BYTES) {
      return jsonResponse(
        { success: false, error: 'Arquivo excede o limite de 20 MB.' },
        400
      );
    }

    let buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const detectedMime = detectMimeFromBytes(bytes, file.type);

    if (!detectedMime) {
      return jsonResponse(
        {
          success: false,
          error: 'Tipo de arquivo não suportado. Envie JPG, PNG, WEBP, GIF, SVG, PDF ou MP4.'
        },
        400
      );
    }

    if (detectedMime === 'image/svg+xml') {
      buffer = sanitizeSvgBuffer(buffer);
    }

    const originalName = file.name || `upload-${Date.now()}`;
    const sanitizedFilename = originalName
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-');
    const timestamp = Date.now();
    const r2Key = `uploads/${timestamp}-${sanitizedFilename}`;
    const publicUrl = env.R2_PUBLIC_DOMAIN
      ? `${String(env.R2_PUBLIC_DOMAIN).replace(/\/$/, '')}/${r2Key}`
      : `/${r2Key}`;

    await env.R2.put(r2Key, buffer, {
      httpMetadata: {
        contentType: detectedMime
      }
    });

    const fileId = `m_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
    const sizeBytes = buffer.byteLength;

    await env.DB.prepare(
      `INSERT INTO rstk_media (id, filename, r2_key, url, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(fileId, sanitizedFilename, r2Key, publicUrl, detectedMime, sizeBytes)
      .run();

    return jsonResponse({
      success: true,
      file: {
        id: fileId,
        filename: sanitizedFilename,
        r2_key: r2Key,
        url: publicUrl,
        mime_type: detectedMime,
        size_bytes: sizeBytes
      }
    }, 201);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
