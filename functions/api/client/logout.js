import {
  jsonResponse,
  clearClientSessionCookie,
  parseCookies
} from '../../../server/client-auth.js';

export async function onRequestPost({ request, env }) {
  try {
    const cookies = parseCookies(request);
    const token = cookies.rstk_client_session;

    if (token && env?.DB) {
      await env.DB.prepare('DELETE FROM rstk_customer_sessions WHERE token = ?')
        .bind(token)
        .run()
        .catch(() => {});
    }

    return jsonResponse(
      { success: true },
      200,
      { 'Set-Cookie': clearClientSessionCookie(request.url) }
    );
  } catch (err) {
    return jsonResponse(
      { success: true },
      200,
      { 'Set-Cookie': clearClientSessionCookie(request.url) }
    );
  }
}
