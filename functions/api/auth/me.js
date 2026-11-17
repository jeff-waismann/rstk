import { jsonResponse, getAuthenticatedUser } from '../../../server/auth.js';

const DEFAULT_TURNSTILE_SITE_KEY = '0x4AAAAAADN7xiosBuzdsddL';

export async function onRequestGet({ request, env }) {
  try {
    const user = await getAuthenticatedUser(request, env);
    return jsonResponse({
      success: true,
      authenticated: Boolean(user),
      user: user || null,
      turnstileSiteKey: env?.TURNSTILE_SITE_KEY || DEFAULT_TURNSTILE_SITE_KEY
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
