import { useEffect, useMemo, useState } from "react"
import { Globe } from "@/components/ui/globe"
import { FireBall } from "@/components/ui/fire-ball"
import { TextScramble } from "@/components/ui/text-scramble"
import { Clock3, Earth, LogIn, LogOut, ShieldCheck, Swords } from "lucide-react"

type SessionState = {
  email: string
  startedAt: number | null
  usedMs: number
  geoCell: string
}

const LIMIT_MS = 6 * 60 * 60 * 1000

function kmBucket(lat: number, lng: number) {
  const step = 0.09
  const a = Math.round(lat / step) * step
  const b = Math.round(lng / step) * step
  return `${a.toFixed(2)}:${b.toFixed(2)}`
}

function fmt(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(total / 3600)).padStart(2, "0")
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const s = String(total % 60).padStart(2, "0")
  return `${h}:${m}:${s}`
}

export default function App() {
  const [email, setEmail] = useState("")
  const [session, setSession] = useState<SessionState | null>(null)
  const [now, setNow] = useState(Date.now())
  const [geoLabel, setGeoLabel] = useState("location pending")
  const [message, setMessage] = useState("Login starts your 6-hour timer.")

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const raw = localStorage.getItem("zenchi_session")
    if (raw) setSession(JSON.parse(raw))
  }, [])

  useEffect(() => {
    if (session) localStorage.setItem("zenchi_session", JSON.stringify(session))
  }, [session])

  const activeUsed = useMemo(() => {
    if (!session) return 0
    const live = session.startedAt ? now - session.startedAt : 0
    return session.usedMs + live
  }, [session, now])

  const left = LIMIT_MS - activeUsed

  const startLogin = () => {
    if (!email.includes("@")) return setMessage("Enter a valid email first.")

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cell = kmBucket(pos.coords.latitude, pos.coords.longitude)
        setGeoLabel(`${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)} (10km cell ${cell})`)

        const db = JSON.parse(localStorage.getItem("zenchi_geo_lock") || "{}") as Record<string, string>
        if (db[cell] && db[cell] !== email.toLowerCase()) {
          setMessage("Another account already used in your geo range. Access blocked.")
          return
        }

        db[cell] = email.toLowerCase()
        localStorage.setItem("zenchi_geo_lock", JSON.stringify(db))

        const prev = session?.email === email.toLowerCase() ? session : null
        const usedMs = prev?.usedMs || 0
        if (usedMs >= LIMIT_MS) {
          setMessage("6-hour limit already exhausted for this account.")
          return
        }

        setSession({
          email: email.toLowerCase(),
          startedAt: Date.now(),
          usedMs,
          geoCell: cell,
        })
        setMessage("Session started. Timer is running.")
      },
      () => setMessage("Location required for anti-multi-account lock."),
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  const logout = () => {
    if (!session) return
    const live = session.startedAt ? Date.now() - session.startedAt : 0
    setSession({ ...session, usedMs: session.usedMs + live, startedAt: null })
    setMessage("Logged out. Timer paused.")
  }

  const playDisabled = !session || left <= 0 || !session.startedAt

  return (
    <main className="relative min-h-screen overflow-hidden grid-bg">
      <FireBall fullScreen particleCount={28} ballColor="#ff1f35" colors={["#ff233b", "#1161ff", "#8a2be2"]} />

      <section className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <TextScramble text="ZENCHI ARCADE" className="neon-red" />
          <div className="glass rounded-full px-4 py-2 text-xs text-muted-foreground">Beta • Space Build</div>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="glass relative overflow-hidden rounded-3xl p-6 md:p-10">
            <img
              src="https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1800&q=80"
              alt="Space"
              className="absolute inset-0 h-full w-full object-cover opacity-20"
            />
            <div className="relative z-10">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">multi-game platform</p>
              <h1 className="mt-4 max-w-xl text-4xl font-black leading-tight md:text-6xl">
                Cosmic play. <span className="neon-red">Strict timer.</span>
              </h1>
              <p className="mt-4 max-w-lg text-sm text-muted-foreground">
                Each player gets 6 hours total. Login starts timer. Logout pauses it. Geo-cell lock (~10km) limits
                multi-account switching on same location range.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button className="btn-red inline-flex items-center gap-2" onClick={startLogin}>
                  <LogIn size={16} /> Start Session
                </button>
                <button className="glass rounded-full px-5 py-3 text-sm" onClick={logout}>
                  <span className="inline-flex items-center gap-2"><LogOut size={15} /> Pause / Logout</span>
                </button>
              </div>
            </div>
          </div>

          <aside className="glass rounded-3xl p-5 md:p-7">
            <div className="relative mx-auto mb-6 h-56 w-full max-w-xs">
              <Globe className="top-0" />
            </div>
            <label className="text-xs text-muted-foreground">Login email (placeholder for Google OAuth)</label>
            <input
              className="mt-2 w-full rounded-xl border border-[#2f375f] bg-[#090d1a] px-4 py-3 text-sm text-white"
              placeholder="player@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="mt-5 space-y-3 text-sm">
              <p className="flex items-center gap-2"><Clock3 size={15} className="text-primary" /> Time left: {fmt(left)}</p>
              <p className="flex items-center gap-2"><Earth size={15} className="text-primary" /> {geoLabel}</p>
              <p className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> {message}</p>
              <p className="flex items-center gap-2"><Swords size={15} className="text-primary" /> Game launch: {playDisabled ? "Locked" : "Ready"}</p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
