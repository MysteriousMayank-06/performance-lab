import { getClient } from './supabase-client.js';

const FRIENDLY = {
  'Invalid login credentials': 'Email or password is incorrect.',
  'Email not confirmed': 'Please confirm your email first — check your inbox.',
  'User already registered': 'An account with this email already exists. Try signing in.',
  'Password should be at least 6 characters': 'Password must be at least 6 characters.',
};
export function friendlyAuthError(err) {
  const m = err?.message || '';
  if (/fetch|network|Failed to/i.test(m)) return 'Can\'t reach the server. Check your connection and try again.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  return FRIENDLY[m] || 'Something went wrong. Please try again.';
}

export const auth = {
  async session() {
    try { const { data } = await (await getClient()).auth.getSession(); return data.session; }
    catch { return null; }
  },
  async signUp(email, password, displayName) {
    const sb = await getClient();
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: displayName || undefined }, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    return { session: data.session, needsConfirm: !data.session };
  },
  async signIn(email, password) {
    const { data, error } = await (await getClient()).auth.signInWithPassword({ email, password });
    if (error) throw error; return data.session;
  },
  async signOut() { await (await getClient()).auth.signOut(); },
  async resetPassword(email) {
    const { error } = await (await getClient()).auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
  },
  async updatePassword(password) {
    const { error } = await (await getClient()).auth.updateUser({ password }); if (error) throw error;
  },
  async onChange(cb) { const sb = await getClient(); return sb.auth.onAuthStateChange((evt, s) => cb(evt, s)); },
  async deleteAccount() {
    const sb = await getClient();
    const { error } = await sb.rpc('delete_my_account');
    if (error) throw error;
    await sb.auth.signOut().catch(() => {});
  },
};
