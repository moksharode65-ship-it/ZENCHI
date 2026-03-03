import { useEffect, useMemo, useRef, useState } from "react"
import { Globe } from "@/components/ui/globe"
import { FireBall } from "@/components/ui/fire-ball"
import { TextScramble } from "@/components/ui/text-scramble"
import { GradientButton } from "@/components/ui/gradient-button"
import { LiquidButton } from "@/components/ui/liquid-glass-button"
import { WebGLShader } from "@/components/ui/web-gl-shader"
import { Clock3, Earth, LogOut, ShieldCheck, Swords, Lock, Rocket } from "lucide-react"

const API = "http://localhost:8787"
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ""

type MeResponse = {
  remainingMs: number
  totalUsedMs: number
  active: boolean
  startedAt: number | null
  limitMs: number
}

type AuthView = "signin" | "login" | "logout" | "home"
type Game = { id: string; title: string; genre: string; stars: string; status: "live" | "soon" }

const GAMES: Game[] = [
  { id: "nebula-run", title: "Nebula Run", genre: "Arcade", stars: "★★★★☆", status: "live" },
  { id: "quantum-drift", title: "Quantum Drift", genre: "Racer", stars: "★★★★★", status: "soon" },
  { id: "void-strike", title: "Action", genre: "Shooter", stars: "★★★★☆", status: "soon" },
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
  const [authView, setAuthView] = useState<AuthView>(localStorage.getItem("zenchi_token") ? "home" : "signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [token, setToken] = useState(localStorage.getItem("zenchi_token") || "")
  const [session, setSession] = useState<MeResponse | null>(null)
  const [sessionSyncedAt, setSessionSyncedAt] = useState(Date.now())
  const [clockNow, setClockNow] = useState(Date.now())
  const [geoLabel, setGeoLabel] = useState("location pending")
  const [message, setMessage] = useState("Sign in, then start session to begin your timer.")
  const googleBtnRef = useRef<HTMLDivElement | null>(null)

  const left = useMemo(() => {
    if (!session) return 0
    if (!session.active) return session.remainingMs
    return Math.max(0, session.remainingMs - (clockNow - sessionSyncedAt))
  }, [session, clockNow, sessionSyncedAt])

  const playDisabled = !session?.active || left <= 0

  const api = async (path: string, method = "GET", body?: unknown, keepalive?: boolean) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  useEffect(() => {
    const id = setInterval(() => setClockNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!token) return
    refreshSession()
    const uiPoll = setInterval(refreshSession, 2000)
    const heartbeat = setInterval(() => {
      if (session?.active) api("/session/heartbeat", "POST").catch(() => null)
    }, 15000)

    return () => {
      clearInterval(uiPoll)
      clearInterval(heartbeat)
    }
  }, [token, session?.active])

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

  const authWithEmail = async () => {
    if (!email.includes("@")) return setMessage("Enter a valid email.")
    if (password.length < 6) return setMessage("Password should be at least 6 characters.")

    try {
      const endpoint = authView === "login" ? "/auth/login" : "/auth/signup"
      const data = await api(endpoint, "POST", { email, password })
      localStorage.setItem("zenchi_token", data.token)
      setToken(data.token)
      setAuthView("home")
      setMessage(authView === "login" ? "Logged in successfully." : "Account created and signed in.")
      setPassword("")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Authentication failed")
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
              setAuthView("home")
              setMessage("Google sign in successful.")
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Google sign in failed")
            }
          },
        })
        g.accounts.id.renderButton(googleBtnRef.current, { theme: "filled_black", size: "large", text: "signin_with" })
        g.accounts.id.prompt()
      }
      document.body.appendChild(s)
    }
    addScript()
  }, [GOOGLE_CLIENT_ID])

  const startSession = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGeoLabel(`${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`)
        try {
          await api("/session/start", "POST", { lat: pos.coords.latitude, lng: pos.coords.longitude })
          await refreshSession()
          setMessage("Session started. Timer running.")
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

  const signOut = async () => {
    try {
      await api("/session/stop", "POST")
    } catch {
      // ignore
    }
    localStorage.removeItem("zenchi_token")
    setToken("")
    setSession(null)
    setAuthView("signin")
    setMessage("Logged out.")
  }

  if (authView === "signin" || authView === "login" || authView === "logout") {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <WebGLShader />
        <FireBall fullScreen particleCount={24} ballColor="#ff1f35" colors={["#ff233b", "#8a2be2", "#f44336"]} />

        <section className="relative z-20 mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-10">
          <div className="glass grid w-full max-w-4xl gap-6 rounded-3xl p-6 md:grid-cols-[1.1fr_1fr] md:p-8">
            <div className="space-y-5">
              <TextScramble text="ZENCHI ACCESS" className="neon-red" />
              <h1 className="text-4xl font-black md:text-5xl">{authView === "logout" ? "Logout" : authView === "login" ? "Login" : "Sign In"}</h1>
              <p className="text-sm text-muted-foreground">Red-space arcade gate. Secure auth + 6-hour session lock + geo protection.</p>
              <img
                src="https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1600&q=80"
                alt="space"
                className="h-44 w-full rounded-2xl object-cover opacity-80"
              />
            </div>

            <div className="glass rounded-2xl p-5">
              {authView === "logout" ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Confirm logout from ZENCHI.</p>
                  <GradientButton className="w-full" onClick={signOut}>Confirm Logout</GradientButton>
                  <LiquidButton variant="outline" className="w-full" onClick={() => setAuthView("home")}>Cancel</LiquidButton>
                </div>
              ) : (
                <>
                  <label className="text-xs text-muted-foreground">Email</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-[#2f375f] bg-[#090d1a] px-4 py-3 text-sm text-white"
                    placeholder="player@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <label className="mt-3 block text-xs text-muted-foreground">Password</label>
                  <input
                    type="password"
                    className="mt-2 w-full rounded-xl border border-[#2f375f] bg-[#090d1a] px-4 py-3 text-sm text-white"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className="mt-4 flex flex-col gap-3">
                    <GradientButton onClick={authWithEmail}>{authView === "login" ? "Login with Password" : "Sign Up with Password"}</GradientButton>
                    <GradientButton variant="variant" onClick={() => setAuthView(authView === "signin" ? "login" : "signin")}>{authView === "signin" ? "Already have account? Login" : "New here? Sign In"}</GradientButton>
                    <div ref={googleBtnRef} className="pt-2" />
                  </div>
                </>
              )}
              <p className="mt-4 text-xs text-muted-foreground">{message}</p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="grid-bg relative min-h-screen overflow-hidden">
      <WebGLShader />
      <FireBall fullScreen particleCount={28} ballColor="#ff1f35" colors={["#ff233b", "#1161ff", "#8a2be2"]} />

      <section className="relative z-20 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <TextScramble text="ZENCHI ARCADE" className="neon-red" />
          <LiquidButton variant="outline" size="default" onClick={() => setAuthView("logout")}>
            <LogOut size={14} /> Logout Page
          </LiquidButton>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="glass relative overflow-hidden rounded-3xl p-6 md:p-10">
            <img src="https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1800&q=80" alt="Space" className="absolute inset-0 h-full w-full object-cover opacity-20" />
            <div className="relative z-10">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">multi-game platform</p>
              <h1 className="mt-4 max-w-xl text-4xl font-black leading-tight md:text-6xl">Cosmic play. <span className="neon-red">Strict timer.</span></h1>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#232a49]">
                <div className="h-full bg-gradient-to-r from-[#ff3b4e] to-[#6f7bff]" style={{ width: `${percent(left, session?.limitMs ?? 1)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Session power: {percent(left, session?.limitMs ?? 1)}%</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <GradientButton onClick={startSession}><Rocket size={16} /> Start Session</GradientButton>
                <GradientButton variant="variant" onClick={stopSession}>Pause Session</GradientButton>
              </div>
            </div>
          </div>

          <aside className="glass rounded-3xl p-5 md:p-7">
            <div className="relative mx-auto mb-4 h-52 w-full max-w-xs"><Globe className="-top-10" /></div>
            <div className="mt-5 space-y-3 text-sm">
              <p className="flex items-center gap-2"><Clock3 size={15} className="text-primary" /> Time left: {fmt(left)}</p>
              <p className="flex items-center gap-2"><Earth size={15} className="text-primary" /> {geoLabel}</p>
              <p className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> {message}</p>
              <p className="flex items-center gap-2"><Swords size={15} className="text-primary" /> Game launch: {playDisabled ? "Locked" : "Ready"}</p>
            </div>
          </aside>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {GAMES.map((g) => {
            const locked = playDisabled || g.status === "soon"
            return (
              <article key={g.id} className="glass rounded-2xl p-4">
                <p className="text-xs text-muted-foreground">{g.genre}</p>
                <h3 className="mt-1 text-lg font-semibold">{g.title}</h3>
                <p className="text-xs text-muted-foreground">{g.stars}</p>
                <button className="mt-4 w-full rounded-xl border border-[#37406d] px-3 py-2 text-sm" disabled={locked}>
                  {locked ? <span className="inline-flex items-center gap-2"><Lock size={14} /> Locked</span> : "Play"}
                </button>
              </article>
            )
          })}
        </section>
      </section>
    </main>
  )
}
