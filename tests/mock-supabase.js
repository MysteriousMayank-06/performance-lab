// Test double for @supabase/supabase-js: lets the real app run in a browser with no backend.
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'tester@example.com', user_metadata: { display_name: 'Mayank' } };
const session = { user, access_token: 'test', refresh_token: 'test' };
function chain(single = false) {
  return new Proxy(function () {}, {
    get(_, k) {
      if (k === 'then') return (res) => res({ data: single ? null : [], error: null });
      if (k === 'maybeSingle' || k === 'single') return () => chain(true);
      return () => chain(single);
    },
    apply() { return chain(single); },
  });
}
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { session }, error: null }), signUp: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }), refreshSession: async () => ({ error: null }), resetPasswordForEmail: async () => ({ error: null }), updateUser: async () => ({ error: null }),
    },
    from: () => chain(), rpc: async () => ({ error: null }),
  };
}
