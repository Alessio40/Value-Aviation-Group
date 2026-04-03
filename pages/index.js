import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import AIRPORTS from '../lib/airports'

const AIRPORT_CODES = Object.keys(AIRPORTS)

function proj(lon, lat, W, H) {
  const x = (lon + 180) / 360 * W
  const latR = lat * Math.PI / 180
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + latR / 2)) / Math.PI) / 2 * H
  return [x, y]
}

function greatCirclePoints(lat1, lon1, lat2, lon2, n = 80) {
  const r = Math.PI / 180
  const [p1,l1,p2,l2] = [lat1*r, lon1*r, lat2*r, lon2*r]
  const d = 2*Math.asin(Math.sqrt(Math.pow(Math.sin((p2-p1)/2),2)+Math.cos(p1)*Math.cos(p2)*Math.pow(Math.sin((l2-l1)/2),2)))
  if (d < 0.0001) return [[lat1,lon1]]
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i/n
    const A = Math.sin((1-t)*d)/Math.sin(d), B = Math.sin(t*d)/Math.sin(d)
    const x = A*Math.cos(p1)*Math.cos(l1)+B*Math.cos(p2)*Math.cos(l2)
    const y = A*Math.cos(p1)*Math.sin(l1)+B*Math.cos(p2)*Math.sin(l2)
    const z = A*Math.sin(p1)+B*Math.sin(p2)
    pts.push([Math.atan2(z,Math.sqrt(x*x+y*y))/r, Math.atan2(y,x)/r])
  }
  return pts
}

function interpolate(lat1, lon1, lat2, lon2, t) {
  const pts = greatCirclePoints(lat1, lon1, lat2, lon2, 100)
  const i = Math.min(Math.floor(t*(pts.length-1)), pts.length-2)
  const frac = t*(pts.length-1)-i
  const [la,lo] = pts[i], [la2,lo2] = pts[i+1]
  const heading = Math.atan2(lo2-lo, la2-la)*180/Math.PI
  return { lat: la+(la2-la)*frac, lon: lo+(lo2-lo)*frac, heading }
}

function timeToMin(t) {
  const [h,m] = t.split(':').map(Number)
  return h*60+m
}

function nowUTCMin() {
  const n = new Date()
  return n.getUTCHours()*60 + n.getUTCMinutes() + n.getUTCSeconds()/60
}

function getStatus(f) {
  const now = nowUTCMin()
  const dep = timeToMin(f.dep_time), arr = timeToMin(f.arr_time)
  let dur = arr-dep; if(dur<=0) dur+=1440
  let elapsed = now-dep; if(elapsed<0) elapsed+=1440
  if(elapsed<0) return 'scheduled'
  if(elapsed>=dur) return 'landed'
  return 'flying'
}

function getProgress(f) {
  const now = nowUTCMin()
  const dep = timeToMin(f.dep_time), arr = timeToMin(f.arr_time)
  let dur = arr-dep; if(dur<=0) dur+=1440
  let elapsed = now-dep; if(elapsed<0) elapsed+=1440
  return Math.max(0, Math.min(1, elapsed/dur))
}

export default function Home() {
  const router = useRouter()
  const canvasRef = useRef(null)
  const countriesRef = useRef([])
  const flightsRef = useRef([])
  const hoveredRef = useRef(null)
  const hitboxesRef = useRef([])
  const animRef = useRef(null)

  const [flights, setFlights] = useState([])
  const [token, setToken] = useState(null)
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: '' })
  const [form, setForm] = useState({ num:'MA101', from:'ZRH', to:'JFK', dep:'08:00', arr:'16:00', type:'B737' })
  const [formErr, setFormErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [utc, setUtc] = useState('')
  const [selectedFlight, setSelectedFlight] = useState(null)

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (!t) { router.push('/login'); return }
    setToken(t)
    loadFlights(t)
  }, [])

  useEffect(() => {
    flightsRef.current = flights
  }, [flights])

  async function loadFlights(t) {
    const res = await fetch('/api/flights', { headers: { Authorization: `Bearer ${t}` } })
    if (res.status === 401) { router.push('/login'); return }
    const data = await res.json()
    setFlights(data)
  }

  function logout() {
    localStorage.removeItem('token')
    router.push('/login')
  }

  async function addFlight(e) {
    e.preventDefault()
    setFormErr('')
    const from = form.from.trim().toUpperCase()
    const to = form.to.trim().toUpperCase()
    if (!form.num.trim()) { setFormErr('Flugnummer fehlt'); return }
    if (!AIRPORTS[from]) { setFormErr(`Unbekannter Flughafen: ${from}`); return }
    if (!AIRPORTS[to]) { setFormErr(`Unbekannter Flughafen: ${to}`); return }
    if (from === to) { setFormErr('Start und Ziel gleich'); return }
    setAdding(true)
    const res = await fetch('/api/flights', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify({ num:form.num.trim(), from_airport:from, to_airport:to, dep_time:form.dep, arr_time:form.arr, aircraft_type:form.type })
    })
    const data = await res.json()
    setAdding(false)
    if (!res.ok) { setFormErr(data.error || 'Fehler'); return }
    setFlights(prev => [...prev, data])
    setForm(f => ({ ...f, num:'MA'+(102+flights.length) }))
  }

  async function deleteFlight(id) {
    await fetch(`/api/flights?id=${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${token}` } })
    setFlights(prev => prev.filter(f => f.id !== id))
    if (selectedFlight?.id === id) setSelectedFlight(null)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.width, H = canvas.height

    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(world => {
        const topojson = window.topojson
        if (!topojson) return
        countriesRef.current = topojson.feature(world, world.objects.countries).features
      })
      .catch(() => {})

    function drawFrame() {
      const ctx = canvas.getContext('2d')
      const W = canvas.width, H = canvas.height

      ctx.fillStyle = '#0b1929'
      ctx.fillRect(0, 0, W, H)

      ctx.strokeStyle = '#1a3a5a'
      ctx.lineWidth = 0.5
      countriesRef.current.forEach(f => {
        ctx.beginPath()
        drawGeo(ctx, f.geometry, W, H)
        ctx.fillStyle = '#0f2337'
        ctx.fill()
        ctx.stroke()
      })

      Object.entries(AIRPORTS).forEach(([code, ap]) => {
        const [x,y] = proj(ap.lon, ap.lat, W, H)
        ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2)
        ctx.fillStyle = '#378add'; ctx.fill()
        ctx.font = '7px monospace'; ctx.fillStyle = '#4a7aaa'
        ctx.textAlign = 'left'; ctx.fillText(code, x+3, y+3)
      })

      const newHitboxes = []
      flightsRef.current.forEach(f => {
        const from = AIRPORTS[f.from_airport], to = AIRPORTS[f.to_airport]
        if (!from || !to) return
        const status = getStatus(f)
        const progress = getProgress(f)
        const pts = greatCirclePoints(from.lat, from.lon, to.lat, to.lon, 80)

        ctx.setLineDash([4,3]); ctx.lineWidth = 0.7
        ctx.strokeStyle = 'rgba(55,138,221,0.2)'
        ctx.beginPath()
        pts.forEach(([la,lo],i) => {
          const [x,y] = proj(lo, la, W, H)
          i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y)
        })
        ctx.stroke()

        if (status === 'flying') {
          const done = Math.min(Math.floor(progress*pts.length), pts.length-1)
          ctx.strokeStyle = 'rgba(55,138,221,0.6)'; ctx.lineWidth = 1
          ctx.beginPath()
          pts.slice(0, done+1).forEach(([la,lo],i) => {
            const [x,y] = proj(lo, la, W, H)
            i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y)
          })
          ctx.stroke()
        }
        ctx.setLineDash([])

        if (status === 'flying') {
          const pos = interpolate(from.lat, from.lon, to.lat, to.lon, progress)
          const [px,py] = proj(pos.lon, pos.lat, W, H)
          const isHov = hoveredRef.current === f.id
          const isSel = selectedFlight?.id === f.id

          ctx.save()
          ctx.translate(px, py)
          ctx.rotate((pos.heading - 90) * Math.PI / 180)
          ctx.font = 'bold 15px sans-serif'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillStyle = isHov || isSel ? '#fac775' : '#ffffff'
          ctx.fillText('✈', 0, 0)
          ctx.restore()

          ctx.font = 'bold 8px monospace'
          ctx.textAlign = 'center'; ctx.textBaseline = 'top'
          ctx.fillStyle = isHov || isSel ? '#fac775' : '#85b7eb'
          ctx.fillText(f.num, px, py+10)

          newHitboxes.push({ x:px, y:py, r:14, f })
        }
      })
      hitboxesRef.current = newHitboxes

      const now = new Date()
      const h = String(now.getUTCHours()).padStart(2,'0')
      const m = String(now.getUTCMinutes()).padStart(2,'0')
      const s = String(now.getUTCSeconds()).padStart(2,'0')
      setUtc(`${h}:${m}:${s} UTC`)

      animRef.current = requestAnimationFrame(drawFrame)
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js'
    script.onload = () => drawFrame()
    document.head.appendChild(script)

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect()
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height
      const mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy
      let hit = null
      hitboxesRef.current.forEach(h => {
        const dx = mx-h.x, dy = my-h.y
        if (Math.sqrt(dx*dx+dy*dy) < h.r) hit = h
      })
      if (hit) {
        hoveredRef.current = hit.f.id
        canvas.style.cursor = 'pointer'
        const f = hit.f
        const p = Math.round(getProgress(f)*100)
        const dep = timeToMin(f.dep_time), arr = timeToMin(f.arr_time)
        let dur = arr-dep; if(dur<=0) dur+=1440
        const rem = Math.round(dur*(1-p/100))
        setTooltip({
          show: true,
          x: e.clientX - rect.left + 14,
          y: e.clientY - rect.top - 10,
          content: `${f.num} · ${f.aircraft_type}\n${AIRPORTS[f.from_airport]?.name} → ${AIRPORTS[f.to_airport]?.name}\nFortschritt: ${p}% · ~${rem} min verbleibend`
        })
      } else {
        hoveredRef.current = null
        canvas.style.cursor = 'default'
        setTooltip(t => ({ ...t, show: false }))
      }
    })

    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect()
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height
      const mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy
      let hit = null
      hitboxesRef.current.forEach(h => {
        const dx = mx-h.x, dy = my-h.y
        if (Math.sqrt(dx*dx+dy*dy) < h.r) hit = h
      })
      setSelectedFlight(hit ? hit.f : null)
    })

    canvas.addEventListener('mouseleave', () => {
      hoveredRef.current = null
      setTooltip(t => ({ ...t, show: false }))
    })

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  function drawGeo(ctx, g, W, H) {
    if (!g) return
    if (g.type === 'Polygon') drawRing(ctx, g.coordinates, W, H)
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(c => drawRing(ctx, c, W, H))
  }

  function drawRing(ctx, coords, W, H) {
    coords.forEach(ring => {
      let first = true
      ring.forEach(([lon, lat]) => {
        const [x, y] = proj(lon, lat, W, H)
        if (first) { ctx.moveTo(x, y); first = false } else ctx.lineTo(x, y)
      })
      ctx.closePath()
    })
  }

  const flying = flights.filter(f => getStatus(f) === 'flying')
  const scheduled = flights.filter(f => getStatus(f) === 'scheduled')
  const landed = flights.filter(f => getStatus(f) === 'landed')

  return (
    <>
      <Head><title>Airline Tracker</title></Head>
      <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>

        <div style={{ background:'#0a1828', borderBottom:'0.5px solid rgba(55,138,221,0.15)', padding:'0 16px', height:44, display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
          <span style={{ fontSize:18, color:'#378add' }}>✈</span>
          <span style={{ fontWeight:500, fontSize:14, color:'#e6f1fb', letterSpacing:'0.5px' }}>Airline Tracker</span>
          <span style={{ fontSize:11, color:'#4a7aaa', marginLeft:4 }}>{utc}</span>
          <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center', fontSize:12 }}>
            <span style={{ color:'#3b6d11', background:'#eaf3de', padding:'2px 8px', borderRadius:99 }}>{flying.length} fliegend</span>
            <span style={{ color:'#5f5e5a', background:'#f1efe8', padding:'2px 8px', borderRadius:99 }}>{scheduled.length} geplant</span>
            <span style={{ color:'#185fa5', background:'#e6f1fb', padding:'2px 8px', borderRadius:99 }}>{landed.length} gelandet</span>
            <button onClick={logout} style={{ fontSize:12, padding:'4px 10px', color:'#4a7aaa' }}>Abmelden</button>
          </div>
        </div>

        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
          <div style={{ position:'relative', flex:1 }}>
            <canvas ref={canvasRef} width={1200} height={700} style={{ width:'100%', height:'100%', display:'block' }} />

            {tooltip.show && (
              <div style={{
                position:'absolute', left:tooltip.x, top:tooltip.y,
                background:'rgba(8,16,28,0.95)', color:'#e6f1fb', fontSize:12,
                padding:'8px 12px', borderRadius:7, pointerEvents:'none',
                whiteSpace:'pre', lineHeight:1.7, border:'0.5px solid rgba(55,138,221,0.3)'
              }}>{tooltip.content}</div>
            )}

            {selectedFlight && (
              <div style={{
                position:'absolute', bottom:16, left:16,
                background:'#0f2337', border:'0.5px solid rgba(55,138,221,0.3)',
                borderRadius:10, padding:'12px 16px', minWidth:240, color:'#e6f1fb'
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontWeight:500, fontSize:15, color:'#fac775' }}>{selectedFlight.num}</span>
                  <button onClick={() => setSelectedFlight(null)} style={{ fontSize:11, padding:'2px 8px', color:'#4a7aaa' }}>✕</button>
                </div>
                <table style={{ fontSize:12, width:'100%', borderCollapse:'collapse' }}>
                  <tbody>
                    {[
                      ['Von', AIRPORTS[selectedFlight.from_airport]?.name || selectedFlight.from_airport],
                      ['Nach', AIRPORTS[selectedFlight.to_airport]?.name || selectedFlight.to_airport],
                      ['Flugzeug', selectedFlight.aircraft_type],
                      ['Abflug', selectedFlight.dep_time + ' UTC'],
                      ['Ankunft', selectedFlight.arr_time + ' UTC'],
                      ['Status', getStatus(selectedFlight) === 'flying' ? `${Math.round(getProgress(selectedFlight)*100)}% ✔` : getStatus(selectedFlight)],
                    ].map(([k,v]) => (
                      <tr key={k}>
                        <td style={{ color:'#4a7aaa', paddingRight:12, paddingBottom:3 }}>{k}</td>
                        <td style={{ color:'#85b7eb' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => deleteFlight(selectedFlight.id)} style={{ marginTop:10, width:'100%', fontSize:12, color:'#f09595', borderColor:'rgba(224,75,74,0.3)' }}>
                  Flug löschen
                </button>
              </div>
            )}
          </div>

          <div style={{
            width:300, background:'#0a1828', borderLeft:'0.5px solid rgba(55,138,221,0.15)',
            display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0
          }}>
            <div style={{ padding:'14px 14px 10px', borderBottom:'0.5px solid rgba(55,138,221,0.1)' }}>
              <p style={{ fontSize:12, fontWeight:500, color:'#85b7eb', marginBottom:10 }}>Flug hinzufügen</p>
              <form onSubmit={addFlight} style={{ display:'flex', flexDirection:'column', gap:7 }}>
                <div>
                  <label style={{ fontSize:10, color:'#4a7aaa', display:'block', marginBottom:3 }}>Flugnummer</label>
                  <input value={form.num} onChange={e=>setForm(f=>({...f,num:e.target.value}))} placeholder="MA101" />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  <div>
                    <label style={{ fontSize:10, color:'#4a7aaa', display:'block', marginBottom:3 }}>Von (IATA)</label>
                    <input value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value.toUpperCase()}))} maxLength={4} placeholder="ZRH" />
                  </div>
                  <div>
                    <label style={{ fontSize:10, color:'#4a7aaa', display:'block', marginBottom:3 }}>Nach (IATA)</label>
                    <input value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value.toUpperCase()}))} maxLength={4} placeholder="JFK" />
                  </div>
                  <div>
                    <label style={{ fontSize:10, color:'#4a7aaa', display:'block', marginBottom:3 }}>Abflug (UTC)</label>
                    <input type="time" value={form.dep} onChange={e=>setForm(f=>({...f,dep:e.target.value}))} />
                  </div>
                  <div>
                    <label style={{ fontSize:10, color:'#4a7aaa', display:'block', marginBottom:3 }}>Ankunft (UTC)</label>
                    <input type="time" value={form.arr} onChange={e=>setForm(f=>({...f,arr:e.target.value}))} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#4a7aaa', display:'block', marginBottom:3 }}>Flugzeugtyp</label>
                  <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    {['B737','A320','B777','A380','B787','A350','B747','A220','E190','ATR72'].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                {formErr && <p style={{ color:'#f09595', fontSize:11 }}>{formErr}</p>}
                <button type="submit" className="btn-primary" disabled={adding} style={{ marginTop:2 }}>
                  {adding ? 'Wird hinzugefügt…' : '+ Flug hinzufügen'}
                </button>
              </form>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>
              <p style={{ fontSize:10, color:'#4a7aaa', marginBottom:8, fontWeight:500 }}>ALLE FLÜGE ({flights.length})</p>
              {flights.length === 0 && <p style={{ fontSize:12, color:'#2a4a6a' }}>Noch keine Flüge.</p>}
              {flights.map(f => {
                const s = getStatus(f)
                const p = Math.round(getProgress(f)*100)
                const statusColor = s==='flying'?{bg:'#eaf3de',c:'#3b6d11'}:s==='landed'?{bg:'#e6f1fb',c:'#185fa5'}:{bg:'#1a2a3a',c:'#4a7aaa'}
                const statusLabel = s==='flying'?`${p}%`:s==='landed'?'Gelandet':'Geplant'
                return (
                  <div key={f.id}
                    onClick={() => setSelectedFlight(selectedFlight?.id===f.id?null:f)}
                    style={{
                      padding:'8px 10px', marginBottom:5, borderRadius:7,
                      border:`0.5px solid ${selectedFlight?.id===f.id?'rgba(55,138,221,0.5)':'rgba(55,138,221,0.12)'}`,
                      background: selectedFlight?.id===f.id?'#0f2337':'transparent',
                      cursor:'pointer', transition:'background 0.1s'
                    }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                      <span style={{ fontWeight:500, fontSize:12, color:'#fac775' }}>{f.num}</span>
                      <span style={{ fontSize:11, color:'#4a7aaa' }}>{f.aircraft_type}</span>
                      <span style={{ marginLeft:'auto', fontSize:10, padding:'1px 7px', borderRadius:99, background:statusColor.bg, color:statusColor.c }}>{statusLabel}</span>
                    </div>
                    <div style={{ fontSize:11, color:'#4a7aaa' }}>
                      {f.from_airport} → {f.to_airport} · {f.dep_time}–{f.arr_time}
                    </div>
                    {s === 'flying' && (
                      <div style={{ marginTop:5, height:3, background:'#0f2337', borderRadius:99 }}>
                        <div style={{ width:`${p}%`, height:'100%', background:'#378add', borderRadius:99 }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
