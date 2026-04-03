import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Login() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Fehler'); setLoading(false); return }
      localStorage.setItem('token', data.token)
      router.push('/')
    } catch {
      setError('Verbindungsfehler')
      setLoading(false)
    }
  }

  return (
    <>
      <Head><title>Login — Airline Tracker</title></Head>
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{
          background:'#0f2337',
          border:'0.5px solid rgba(55,138,221,0.2)',
          borderRadius:12,
          padding:'2rem 2.5rem',
          width:'100%',
          maxWidth:360
        }}>
          <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>✈</div>
            <h1 style={{ fontSize:20, fontWeight:500, color:'#e6f1fb' }}>Airline Tracker</h1>
            <p style={{ color:'#4a7aaa', fontSize:12, marginTop:4 }}>Nur für autorisierte Benutzer</p>
          </div>

          <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ color:'#85b7eb', fontSize:11, display:'block', marginBottom:4 }}>Benutzername</label>
              <input
                type="text"
                value={username}
                onChange={e=>setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label style={{ color:'#85b7eb', fontSize:11, display:'block', marginBottom:4 }}>Passwort</label>
              <input
                type="password"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p style={{ color:'#f09595', fontSize:12 }}>{error}</p>}
            <button type="submit" className="btn-primary" style={{ marginTop:4, padding:'9px 0', width:'100%' }} disabled={loading}>
              {loading ? 'Anmelden…' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
