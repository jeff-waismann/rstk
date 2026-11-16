import { jsonResponse, parseCookies, clearSessionCookie } from '../../../server/auth.js';

export async function onRequestPost({ request, env }) {
  try {
    const cookies = parseCookies(request);
    if (env?.DB && cookies.rstk_session) {
      await env.DB.prepare('DELETE FROM rstk_sessions WHERE token = ?')
        .bind(cookies.rstk_session)
        .run();
    }
    return jsonResponse(
      { success: true },
      200,
      { 'Set-Cookie': clearSessionCookie(request.url) }
    );
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
