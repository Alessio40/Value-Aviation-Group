import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'change-this-secret'

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}

export function getTokenFromRequest(req) {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}
