export async function onRequestGet({ env, params }) {
  const pathArray = params.path;
  if (!pathArray || pathArray.length === 0) {
    return new Response('Not found', { status: 404 });
  }

  const fileKey = `uploads/${pathArray.join('/')}`;

  if (!env?.R2) {
    return new Response('R2 binding not found', { status: 500 });
  }

  try {
    const object = await env.R2.get(fileKey);
    if (!object) {
      return new Response('Object Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(object.body, { headers });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
