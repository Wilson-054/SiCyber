
import { createClient } from '@/../utils/supabase/server'

export default async function TestSupabasePage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getSession()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const connected = !error && !!url

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: 600 }}>
      <h1 style={{ marginBottom: '1rem' }}>Supabase Connection Test</h1>

      <div
        style={{
          padding: '1rem',
          borderRadius: 8,
          background: connected ? '#e6ffed' : '#ffe6e6',
          border: `1px solid ${connected ? '#2ecc71' : '#e74c3c'}`,
          marginBottom: '1.5rem',
        }}
      >
        <strong>{connected ? '✅ Connected to Supabase' : '❌ Connection failed'}</strong>
      </div>

      <h3>Env vars</h3>
      <ul>
        <li>NEXT_PUBLIC_SUPABASE_URL: {url ? `${url.slice(0, 30)}...` : '❌ MISSING'}</li>
        <li>NEXT_PUBLIC_SUPABASE_ANON_KEY: {hasAnonKey ? '✅ present' : '❌ MISSING'}</li>
      </ul>

      <h3>Session check response</h3>
      <pre
        style={{
          background: '#f5f5f5',
          padding: '1rem',
          borderRadius: 8,
          overflowX: 'auto',
        }}
      >
        {JSON.stringify({ data, error }, null, 2)}
      </pre>

      {error && (
        <p style={{ color: '#e74c3c', marginTop: '1rem' }}>
          If you see an error above, double check your .env.local values and
          restart your dev server (env vars only load on server start).
        </p>
      )}
    </div>
  )
}