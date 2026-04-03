export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { username, password } = req.body

  const validUser = process.env.APP_USERNAME
  const validPass = process.env.APP_PASSWORD

  if (!validUser || !validPass) {
    return res.status(500).json({ error: 'Server nicht konfiguriert' })
  }

  if (username !== validUser || password !== validPass) {
    return res.status(401).json({ error: 'Ungültige Zugangsdaten' })
  }

  const { signToken } = await import('../../lib/auth')
  const token = signToken({ username })
  res.json({ token })
}
