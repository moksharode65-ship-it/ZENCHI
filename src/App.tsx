import { useEffect, useMemo, useState } from "react"
import { Globe } from "@/components/ui/globe"
import { FireBall } from "@/components/ui/fire-ball"
import { TextScramble } from "@/components/ui/text-scramble"
import { Clock3, Earth, LogIn, LogOut, ShieldCheck, Swords } from "lucide-react"

const API = "http://localhost:8787"

type MeResponse = {
  remainingMs: number
  totalUsedMs: number
  active: boolean
  startedAt: number | null
  limitMs: number
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
  const [token, setToken] = useState(localStorage.getItem("zenchi_token") || "")
  const [session, setSession] = useState<MeResponse | null>(null)
  const [geoLabel, setGeoLabel] = useState("location pending")
  const [message, setMessage] = useState("Login and start session to begin timer.")

  const left = useMemo(() => session?.remainingMs ?? 0, [session])

  const api = async (path: string, method = "GET", body?: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to refresh session")
    }
  }

  useEffect(() => {
    if (!token) return
    refreshSession()
    const id = setInterval(refreshSession, 1000)
    return () => clearInterval(id)
  }, [token])

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

  const playDisabled = !session?.active || (session?.remainingMs ?? 0) <= 0

  return (
    <main className="grid-bg relative min-h-screen overflow-hidden">
      <FireBall fullScreen particleCount={28} ballColor="#ff1f35" colors={["#ff233b", "#1161ff", "#8a2be2"]} />

      <section className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <TextScramble text="ZENCHI ARCADE" className="neon-red" />
          <div className="glass rounded-full px-4 py-2 text-xs text-muted-foreground">Beta • Secure Session Mode</div>
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
                Proper backend timer (6h), geo lock by distance (10km), auth token sessions. This now runs with API
                enforcement instead of browser-only storage.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button className="btn-red inline-flex items-center gap-2" onClick={login}>
                  <LogIn size={16} /> Authenticate
                </button>
                <button className="btn-red inline-flex items-center gap-2" onClick={startSession}>
                  <LogIn size={16} /> Start Session
                </button>
                <button className="glass rounded-full px-5 py-3 text-sm" onClick={stopSession}>
                  <span className="inline-flex items-center gap-2">
                    <LogOut size={15} /> Pause / Logout
                  </span>
                </button>
              </div>
            </div>
          </div>

          <aside className="glass rounded-3xl p-5 md:p-7">
            <div className="relative mx-auto mb-6 h-56 w-full max-w-xs">
              <Globe className="-top-8" />
            </div>
            <label className="text-xs text-muted-foreground">Google email (dev auth until Google button is wired)</label>
            <input
              className="mt-2 w-full rounded-xl border border-[#2f375f] bg-[#090d1a] px-4 py-3 text-sm text-white"
              placeholder="player@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="mt-5 space-y-3 text-sm">
              <p className="flex items-center gap-2">
                <Clock3 size={15} className="text-primary" /> Time left: {fmt(left)}
              </p>
              <p className="flex items-center gap-2">
                <Earth size={15} className="text-primary" /> {geoLabel}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-primary" /> {message}
              </p>
              <p className="flex items-center gap-2">
                <Swords size={15} className="text-primary" /> Game launch: {playDisabled ? "Locked" : "Ready"}
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
