import { callRpc } from './_lib/supabaseAdmin.js';
import { json } from './_lib/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Customers have no accounts, so the private token in their receipt link is the access check. */
export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!UUID.test(token)) return json({ error: 'Receipt not found.' }, 404);

  try {
    const receipt = await callRpc('get_order_receipt', { p_token: token });
    return receipt ? json({ order: receipt }) : json({ error: 'Receipt not found.' }, 404);
  } catch (err) {
    console.error('receipt:', err.message);
    return json({ error: 'The receipt could not be loaded. Please try again.' }, 500);
  }
}
