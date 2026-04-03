import { supabase } from '../../lib/supabase'
import { verifyToken, getTokenFromRequest } from '../../lib/auth'

export default async function handler(req, res) {
  const token = getTokenFromRequest(req)
  if (!verifyToken(token)) return res.status(401).json({ error: 'Nicht autorisiert' })

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('flights').select('*').order('created_at', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { num, from_airport, to_airport, dep_time, arr_time, aircraft_type } = req.body
    const { data, error } = await supabase.from('flights').insert([
      { num, from_airport, to_airport, dep_time, arr_time, aircraft_type }
    ]).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    const { error } = await supabase.from('flights').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  res.status(405).end()
}
