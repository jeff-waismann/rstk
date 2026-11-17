import { jsonResponse, getAuthenticatedClient } from '../../../server/client-auth.js';

export async function onRequestGet({ request, env }) {
  try {
    const client = await getAuthenticatedClient(request, env);
    if (!client) {
      return jsonResponse({ loggedIn: false });
    }
    return jsonResponse({
      loggedIn: true,
      client
    });
  } catch (err) {
    return jsonResponse({ loggedIn: false, error: err.message }, 500);
  }
}
