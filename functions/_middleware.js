/**
 * Cloudflare Pages Functions Middleware
 * Redirects all *.pages.dev traffic to the official custom domain (rstk.com.br)
 * with a permanent 301 redirect to prevent duplicate indexing and consolidate traffic.
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname.endsWith('.pages.dev')) {
    url.hostname = 'rstk.com.br';
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
