import { createClient } from '@supabase/supabase-js';

let client = null;

function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error('Supabase is not configured on the server');
  client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * Calls a database function as the server. Orders are not readable or writable directly: each
 * payment step is one function of migration 09, granted to service_role only.
 */
export async function callRpc(name, args) {
  const { data, error } = await getClient().rpc(name, args);
  if (error) {
    const err = new Error(`${name}: ${error.message}`);
    err.code = error.code;
    err.dbMessage = error.message;
    throw err;
  }
  return data;
}
