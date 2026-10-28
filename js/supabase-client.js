import { SUPABASE_LIB, getConfig, looksLikeSecret } from './config.js';

let client = null;
export async function getClient() {
  if (client) return client;
  const { url, key } = getConfig();
  if (looksLikeSecret(key)) throw new Error('That looks like a secret key. Use the publishable/anon key only.');
  const { createClient } = await import(SUPABASE_LIB);
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
export function resetClient() { client = null; }
