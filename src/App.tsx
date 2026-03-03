import { useEffect, useMemo, useRef, useState } from "react"
import { Globe } from "@/components/ui/globe"
import { FireBall } from "@/components/ui/fire-ball"
import { TextScramble } from "@/components/ui/text-scramble"
import { Clock3, Earth, LogIn, LogOut, ShieldCheck, Swords, Lock, Rocket, Gauge, Users, ArrowLeft } from "lucide-react"

const API = "http://localhost:8787"
const ADMIN_KEY = "zenchi-admin"
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ""

type MeResponse = {
  remainingMs: number
  totalUsedMs: number
  active: boolean
  startedAt: number | null
  limitMs: number
}

type AdminOverview = {
  users: number
  activeUsers: number
  exhaustedUsers: number
  recentLocks: { id: number; email: string; lat: number; lng: number; createdAt: number }[]
  geoRadiusKm: number
}

type ViewMode = "arcade" | "admin" | "game"
type Game = { id: string; title: string; genre: string; stars: string; status: "live" | "soon" }

const GAMES: Game[] = [
  { id: "nebula-run", title: "Nebula Run", genre: "Arcade", stars: "★★★★☆", status: "live" },
  { id: "quantum-drift", title: "Quantum Drift", genre: "Racer", stars: "★★★★★", status: "soon" },
  { id: "void-strike", title: "Void Strike", genre: "Action", stars: "★★★★☆", status: "soon" },
  { id: "orbit-ops", title: "Orbit Ops", genre: "Puzzle", stars: "★★★☆☆", status: "live" },
]

function fmt(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(total / 3600)).padStart(2, "0")
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const s = String(total % 60).padStart(2, "0")
  return `${h}:${m}:${s}`
}

function percent(remaining: number, limit: number) {
  if (limit <= 0) return 0
  return Math.round((remaining / limit) * 100)
}

export default function App() {
  const [view, setView] = useState<ViewMode>("arcade")
  const [activeGame, setActiveGame] = useState<Game | null>(null)
  const [email, setEmail] = useState("")
  const [token, setToken] = useState(localStorage.getItem("zenchi_token") || "")
  const [session, setSession] = useState<MeResponse | null>(null)
  const [sessionSyncedAt, setSessionSyncedAt] = useState(Date.now())
  const [clockNow, setClockNow] = useState(Date.now())
  const [geoLabel, setGeoLabel] = useState("location pending")
  const [message, setMessage] = useState("Login and start session to begin timer.")
  const [adminData, setAdminData] = useState<AdminOverview | null>(null)
  const googleBtnRef = useRef<HTMLDivElement | null>(null)

  const left = useMemo(() => {
    if (!session) return 0
    if (!session.active) return session.remainingMs
    return Math.max(0, session.remainingMs - (clockNow - sessionSyncedAt))
  }, [session, clockNow, sessionSyncedAt])
  const playDisabled = !session?.active || left <= 0

  const api = async (path: string, method = "GET", body?: unknown, extraHeaders?: Record<string, string>, keepalive?: boolean) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extraHeaders || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      keepalive,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || "Request failed")
    return data
  }

  const refreshSession = async () => {
    if (!token) return
    try {
      const me = (await api("/session/me")) as MeResponse
      setSession(me)
      setSessionSyncedAt(Date.now())
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to refresh session")
    }
  }

  const loadAdmin = async () => {
    try {
      const data = (await api("/admin/overview", "GET", undefined, { "x-admin-key": ADMIN_KEY })) as AdminOverview
      setAdminData(data)
    } catch {
      setAdminData(null)
    }
  }

  useEffect(() => {
    const id = setInterval(() => setClockNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!token) return
    refreshSession()
    loadAdmin()

    const uiPoll = setInterval(() => {
      refreshSession()
      if (view === "admin") loadAdmin()
    }, 1500)

    const heartbeat = setInterval(() => {
      if (session?.active) api("/session/heartbeat", "POST").catch(() => null)
    }, 15000)

    return () => {
      clearInterval(uiPoll)
      clearInterval(heartbeat)
    }
  }, [token, view, session?.active])

  useEffect(() => {
    const emergencyPause = () => {
      if (!token || !session?.active) return
      fetch(`${API}/session/stop`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") emergencyPause()
    }

    window.addEventListener("beforeunload", emergencyPause)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("beforeunload", emergencyPause)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [token, session?.active])

  const login = async () => {
    if (!email.includes("@")) return setMessage("Enter a valid email.")
    try {
      const data = await api("/auth/google", "POST", { email })
      localStorage.setItem("zenchi_token", data.token)
      setToken(data.token)
      setMessage("Authenticated. Now start session.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Login failed")
    }
  }

  useEffect(() => {
    const addScript = () => {
      if (document.getElementById("google-identity")) return
      const s = document.createElement("script")
      s.src = "https://accounts.google.com/gsi/client"
      s.async = true
      s.defer = true
      s.id = "google-identity"
      s.onload = () => {
        const g = (window as any).google
        if (!g || !googleBtnRef.current || !GOOGLE_CLIENT_ID) return
        g.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (resp: { credential: string }) => {
            try {
              const data = await api("/auth/google", "POST", { idToken: resp.credential })
              localStorage.setItem("zenchi_token", data.token)
              setToken(data.token)
              setMessage("Google login success.")
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Google login failed")
            }
          },
        })
        g.accounts.id.renderButton(googleBtnRef.current, { theme: "filled_black", size: "medium", text: "signin_with" })
      }
      document.body.appendChild(s)
    }
    addScript()
  }, [])

  const startSession = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGeoLabel(`${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`)
        try {
          await api("/session/start", "POST", { lat: pos.coords.latitude, lng: pos.coords.longitude })
          await refreshSession()
          setMessage("Session started. Timer is running.")
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Could not start session")
        }
      },
      () => setMessage("Location permission is required."),
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  const stopSession = async () => {
    try {
      await api("/session/stop", "POST")
      await refreshSession()
      setMessage("Session paused.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not stop session")
    }
  }

  const launchGame = (g: Game) => {
    if (playDisabled || g.status !== "live") return
    setActiveGame(g)
    setView("game")
  }

  if (view === "game" && activeGame) {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <FireBall fullScreen particleCount={18} ballColor="#ff1f35" colors={["#ff233b", "#1161ff", "#8a2be2"]} />
        <section className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-10">
          <button className="glass mb-6 inline-flex w-fit items-center gap-2 rounded-full px-4 py-2" onClick={() => setView("arcade")}>
            <ArrowLeft size={14} /> Back to Arcade
          </button>
          <div className="glass rounded-3xl p-8">
            <p className="text-xs text-muted-foreground">Now Launching</p>
            <h1 className="mt-2 text-4xl font-black">{activeGame.title}</h1>
            <p className="mt-2 text-muted-foreground">Genre: {activeGame.genre}</p>
            <p className="mt-2 text-muted-foreground">Remaining play time: {fmt(left)}</p>
            <div className="mt-6 rounded-2xl border border-[#2b335c] bg-[#080b18] p-6 text-sm text-muted-foreground">
              Game runtime shell ready. We can now mount your real game bundle here.
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="grid-bg relative min-h-screen overflow-hidden">
      <FireBall fullScreen particleCount={28} ballColor="#ff1f35" colors={["#ff233b", "#1161ff", "#8a2be2"]} />

      <section className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <TextScramble text="ZENCHI ARCADE" className="neon-red" />
          <div className="flex gap-2">
            <button className="glass rounded-full px-4 py-2 text-xs" onClick={() => setView("arcade")}>Arcade</button>
            <button className="glass rounded-full px-4 py-2 text-xs" onClick={() => { setView("admin"); loadAdmin() }}>Admin</button>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="glass relative overflow-hidden rounded-3xl p-6 md:p-10">
            <img src="https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1800&q=80" alt="Space" className="absolute inset-0 h-full w-full object-cover opacity-20" />
            <div className="relative z-10">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">multi-game platform</p>
              <h1 className="mt-4 max-w-xl text-4xl font-black leading-tight md:text-6xl">Cosmic play. <span className="neon-red">Strict timer.</span></h1>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#232a49]"><div className="h-full bg-gradient-to-r from-[#ff3b4e] to-[#6f7bff]" style={{ width: `${percent(left, session?.limitMs ?? 1)}%` }} /></div>
              <p className="mt-2 text-xs text-muted-foreground">Session power: {percent(left, session?.limitMs ?? 1)}%</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button className="btn-red inline-flex items-center gap-2" onClick={login}><LogIn size={16} /> Authenticate</button>
                <button className="btn-red inline-flex items-center gap-2" onClick={startSession}><Rocket size={16} /> Start Session</button>
                <button className="glass rounded-full px-5 py-3 text-sm" onClick={stopSession}><span className="inline-flex items-center gap-2"><LogOut size={15} /> Pause / Logout</span></button>
              </div>
            </div>
          </div>

          <aside className="glass rounded-3xl p-5 md:p-7">
            <div className="relative mx-auto mb-4 h-52 w-full max-w-xs"><Globe className="-top-10" /></div>
            <label className="text-xs text-muted-foreground">Google email (dev auth fallback)</label>
            <input className="mt-2 w-full rounded-xl border border-[#2f375f] bg-[#090d1a] px-4 py-3 text-sm text-white" placeholder="player@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div ref={googleBtnRef} className="mt-3" />
            <div className="mt-5 space-y-3 text-sm">
              <p className="flex items-center gap-2"><Clock3 size={15} className="text-primary" /> Time left: {fmt(left)}</p>
              <p className="flex items-center gap-2"><Earth size={15} className="text-primary" /> {geoLabel}</p>
              <p className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> {message}</p>
              <p className="flex items-center gap-2"><Swords size={15} className="text-primary" /> Game launch: {playDisabled ? "Locked" : "Ready"}</p>
            </div>
          </aside>
        </div>

        {view === "arcade" ? (
          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {GAMES.map((g) => {
              const locked = playDisabled || g.status === "soon"
              return (
                <article key={g.id} className="glass rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground">{g.genre}</p>
                  <h3 className="mt-1 text-lg font-semibold">{g.title}</h3>
                  <p className="text-xs text-muted-foreground">{g.stars}</p>
                  <button className="mt-4 w-full rounded-xl border border-[#37406d] px-3 py-2 text-sm" disabled={locked} onClick={() => launchGame(g)}>
                    {locked ? <span className="inline-flex items-center gap-2"><Lock size={14} /> Locked</span> : "Play"}
                  </button>
                </article>
              )
            })}
          </section>
        ) : (
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="glass rounded-2xl p-4"><p className="text-xs text-muted-foreground">Admin Users</p><p className="mt-2 text-2xl font-bold inline-flex items-center gap-2"><Users size={18} /> {adminData?.users ?? 0}</p></div>
            <div className="glass rounded-2xl p-4"><p className="text-xs text-muted-foreground">Active Sessions</p><p className="mt-2 text-2xl font-bold inline-flex items-center gap-2"><Gauge size={18} /> {adminData?.activeUsers ?? 0}</p></div>
            <div className="glass rounded-2xl p-4"><p className="text-xs text-muted-foreground">Exhausted Accounts</p><p className="mt-2 text-2xl font-bold inline-flex items-center gap-2"><Clock3 size={18} /> {adminData?.exhaustedUsers ?? 0}</p></div>
          </section>
        )}
      </section>
    </main>
  )
}
