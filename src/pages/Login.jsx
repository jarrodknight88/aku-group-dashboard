import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { colors, fonts } from '../theme.js'

const inputStyle = {
  width: '100%',
  padding: '11px 13px',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 9,
  fontSize: 14,
  fontFamily: 'inherit',
}

export default function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await signIn(email, password)
    setBusy(false)
    if (err) {
      setError(err.message === 'Invalid login credentials' ? 'Invalid email or password.' : err.message)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.pageBg,
        color: colors.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 26,
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26, justifyContent: 'center' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: colors.brand,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fonts.serif,
              fontWeight: 600,
              fontSize: 24,
            }}
          >
            A
          </div>
          <div style={{ lineHeight: 1.08 }}>
            <div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 22, letterSpacing: '-0.01em' }}>
              Aku Group
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, fontWeight: 500, letterSpacing: '0.03em' }}>
              OPERATIONS DASHBOARD
            </div>
          </div>
        </div>

        <form
          onSubmit={submit}
          style={{
            background: '#fff',
            border: `1px solid ${colors.border}`,
            borderRadius: 15,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 600 }}>Sign in</div>
          <div style={{ fontSize: 12, color: colors.muted3, marginTop: -8 }}>
            Access is by invitation — ask your administrator for an account.
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: colors.muted2 }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: colors.muted2 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
          {error && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: colors.red,
                background: colors.redBg,
                padding: '9px 12px',
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              background: colors.brand,
              padding: '11px 20px',
              border: 'none',
              borderRadius: 9,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
