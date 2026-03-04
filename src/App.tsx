import { useEffect, useMemo, useRef, useState } from "react"
import { Globe, type GlobePreset } from "@/components/ui/globe"
import { FireBall } from "@/components/ui/fire-ball"
import { TextScramble } from "@/components/ui/text-scramble"
import { GradientButton } from "@/components/ui/gradient-button"
import { LiquidButton } from "@/components/ui/liquid-glass-button"
import { WebGLShader } from "@/components/ui/web-gl-shader"
import { Clock3, LogOut, ShieldCheck, Swords, Lock, Rocket, ArrowLeft, LayoutTemplate } from "lucide-react"
import { ContainerScroll } from "@/components/ui/container-scroll-animation"

const API = (import.meta.env.VITE_API_URL as string) || "http://localhost:8787"
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || ""

type MeResponse = {
  email: string
  remainingMs: number
  totalUsedMs: number
  active: boolean
  startedAt: number | null
  limitMs: number
}

type AuthResponse = {
  success: boolean
  user?: { email: string }
  session?: MeResponse
}

type AuthView = "login" | "logout" | "home"
type GamePage = "home" | "genre"
type Game = { id: string; title: string; genre: string; stars: string; status: "live" | "soon" }

type GoogleCredentialResponse = { credential?: string }

type DeviceFingerprintPayload = {
  userAgent: string
  platform: string
  language: string
  timezone: string
  screen: string
  colorDepth: number
  hardwareConcurrency: number
  deviceMemory: number
  touchSupport: number
  canvas: string
}

type GoogleWindow = Window & {
  google?: {
    accounts?: {
      id?: {
        initialize: (cfg: {
          client_id: string
          callback: (response: GoogleCredentialResponse) => void
          auto_select?: boolean
          cancel_on_tap_outside?: boolean
        }) => void
        renderButton: (
          parent: HTMLElement,
          options: {
            type?: "standard" | "icon"
            theme?: "outline" | "filled_blue" | "filled_black"
            size?: "large" | "medium" | "small"
            text?: "signin_with" | "signup_with" | "continue_with" | "signin"
            shape?: "rectangular" | "pill" | "circle" | "square"
            width?: string | number
            logo_alignment?: "left" | "center"
          },
        ) => void
      }
    }
  }
}

const GAMES: Game[] = [
  { id: "nebula-run", title: "Nebula Run", genre: "Arcade", stars: "?????", status: "live" },
  { id: "quantum-drift", title: "Quantum Drift", genre: "Race", stars: "?????", status: "soon" },
  { id: "void-strike", title: "Action", genre: "Shooter", stars: "?????", status: "soon" },
  { id: "orbit-ops", title: "Orbit Ops", genre: "Puzzle", stars: "?????", status: "live" },
]

const FIRE_COLORS_AUTH = ["#ff233b", "#8a2be2", "#f44336"]
const FIRE_COLORS_HOME = ["#ff233b", "#1161ff", "#8a2be2"]

const GENRE_SHOWCASE: Array<{ genre: string; image: string; subtitle: string }> = [
  {
    genre: "Arcade",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1400&auto=format&fit=crop",
    subtitle: "Neon classics, fast fun",
  },
  {
    genre: "Puzzle",
    image: "https://images.unsplash.com/photo-1586165368502-1bad197a6461?q=80&w=1400&auto=format&fit=crop",
    subtitle: "Brain-first challenge mode",
  },
  {
    genre: "Shooter",
    image: "https://images.unsplash.com/photo-1542751371-29b0f74f9713?q=80&w=1400&auto=format&fit=crop",
    subtitle: "Tactical precision combat",
  },
  {
    genre: "Race",
    image: "https://images.unsplash.com/photo-1563720223185-11003d516935?q=80&w=1400&auto=format&fit=crop",
    subtitle: "Full-throttle speed lanes",
  },
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

function fingerprintCanvasSignature() {
  const canvas = document.createElement("canvas")
  canvas.width = 220
  canvas.height = 32
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.textBaseline = "top"
  ctx.font = "14px Arial"
  ctx.fillStyle = "#f60"
  ctx.fillRect(125, 1, 62, 20)
  ctx.fillStyle = "#069"
  ctx.fillText("zenchi-fingerprint", 2, 15)
  ctx.fillStyle = "rgba(102,204,0,0.7)"
  ctx.fillText("zenchi-fingerprint", 4, 17)

  return canvas.toDataURL()
}

function buildFingerprintPayload(): DeviceFingerprintPayload {
  return {
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen: `${window.screen.width}x${window.screen.height}`,
    colorDepth: Number(window.screen.colorDepth || 0),
    hardwareConcurrency: Number(navigator.hardwareConcurrency || 0),
    deviceMemory: Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0),
    touchSupport: Number(navigator.maxTouchPoints || 0),
    canvas: fingerprintCanvasSignature(),
  }
}

export default function App() {
  const [authView, setAuthView] = useState<AuthView>("login")
  const [email, setEmail] = useState("")
  const [session, setSession] = useState<MeResponse | null>(null)
  const [sessionSyncedAt, setSessionSyncedAt] = useState(Date.now())
  const [clockNow, setClockNow] = useState(Date.now())
  const [message, setMessage] = useState("Sign in with Google to continue.")
  const [globePreset, setGlobePreset] = useState<GlobePreset>("earth")
  const [gamePage, setGamePage] = useState<GamePage>("home")
  const [selectedGenre, setSelectedGenre] = useState<string>("Arcade")
  const [autoLogoutDone, setAutoLogoutDone] = useState(false)
  const [autoResumeTried, setAutoResumeTried] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)

  const left = useMemo(() => {
    if (!session) return 0
    if (!session.active) return session.remainingMs
    return Math.max(0, session.remainingMs - (clockNow - sessionSyncedAt))
  }, [session, clockNow, sessionSyncedAt])

  const playDisabled = !session?.active || left <= 0
  const genres = useMemo(() => Array.from(new Set(GAMES.map((g) => g.genre))), [])
  const visibleGames = useMemo(
    () => (gamePage === "genre" ? GAMES.filter((g) => g.genre === selectedGenre) : GAMES),
    [gamePage, selectedGenre],
  )

  const api = async (path: string, method = "GET", body?: unknown, keepalive?: boolean) => {
    const res = await fetch(`${API}${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      keepalive,
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || "Request failed")
    return data
  }

  const refreshSession = async () => {
    try {
      const me = (await api("/session/me")) as MeResponse
      setSession(me)
      setEmail(me.email)
      setSessionSyncedAt(Date.now())
      setAuthView("home")
    } catch {
      setSession(null)
    }
  }

  const bootstrapAuth = async () => {
    try {
      const me = (await api("/auth/me")) as { user: { email: string }; session: MeResponse }
      setEmail(me.user.email)
      setSession(me.session)
      setSessionSyncedAt(Date.now())
      setAuthView("home")
      setMessage("")
    } catch {
      setAuthView("login")
    }
  }

  const handleGoogleCredential = async (response: GoogleCredentialResponse) => {
    const credential = response.credential || ""
    if (!credential) {
      setMessage("Google login failed. Missing credential token.")
      return
    }

    setAuthLoading(true)
    try {
      const fingerprint = buildFingerprintPayload()
      const data = (await api("/auth/google", "POST", {
        credential,
        fingerprint,
      })) as AuthResponse
      const accountEmail = data.user?.email || ""

      setEmail(accountEmail)
      if (data.session) {
        setSession(data.session)
        setSessionSyncedAt(Date.now())
      }
      setAutoLogoutDone(false)
      setAuthView("home")
      setMessage("")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Authentication failed")
    } finally {
      setAuthLoading(false)
    }
  }

  useEffect(() => {
    void bootstrapAuth()
  }, [])

  useEffect(() => {
    const id = setInterval(() => setClockNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (authView !== "home") return
    void refreshSession()

    const uiPoll = setInterval(() => {
      void refreshSession()
    }, 2000)

    const heartbeat = setInterval(() => {
      if (session?.active) {
        void api("/session/heartbeat", "POST", undefined, true).catch(() => null)
      }
    }, 15000)

    return () => {
      clearInterval(uiPoll)
      clearInterval(heartbeat)
    }
  }, [authView, session?.active])

  useEffect(() => {
    if (authView !== "home") {
      setAutoLogoutDone(false)
      setAutoResumeTried(false)
      return
    }
    if (!session) return
    if (left > 0 || autoLogoutDone) return
    setAutoLogoutDone(true)
    setMessage("Time limit exhausted. Logging out.")
    void signOut("Time limit exhausted.")
  }, [authView, session, left, autoLogoutDone])

  useEffect(() => {
    if (authView !== "home" || !session) return
    if (session.active || session.remainingMs <= 0 || autoResumeTried) return

    setAutoResumeTried(true)
    resumeSession(true)
  }, [authView, session?.active, session?.remainingMs, autoResumeTried])

  useEffect(() => {
    if (authView !== "login") return

    if (!GOOGLE_CLIENT_ID) {
      setMessage("Missing VITE_GOOGLE_CLIENT_ID in .env")
      return
    }

    const w = window as GoogleWindow
    const scriptId = "google-identity-script"

    const initializeButton = () => {
      if (!googleButtonRef.current || !w.google?.accounts?.id) return

      w.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      googleButtonRef.current.innerHTML = ""
      w.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 320,
      })

      setGoogleReady(true)
    }

    if (w.google?.accounts?.id) {
      initializeButton()
      return
    }

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener("load", initializeButton, { once: true })
      return
    }

    const script = document.createElement("script")
    script.id = scriptId
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = initializeButton
    script.onerror = () => setMessage("Failed to load Google Sign-In script.")
    document.head.appendChild(script)
  }, [authView])

  const resumeSession = (silent = false) => {
    void (async () => {
      try {
        await api("/session/start", "POST", {})
        await refreshSession()
        if (!silent) setMessage("Session active. Timer running.")
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Could not start session")
      }
    })()
  }

  const signOut = async (logoutMessage = "Logged out.") => {
    try {
      await api("/auth/logout", "POST")
    } catch {
      // ignore
    }

    setSession(null)
    setEmail("")
    setAuthView("login")
    setMessage(logoutMessage)
  }

  if (authView === "login" || authView === "logout") {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <WebGLShader />
        <FireBall fullScreen particleCount={24} ballColor="#ff1f35" colors={FIRE_COLORS_AUTH} />

        <section className="relative z-20 mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-10">
          <div className="glass grid w-full max-w-4xl gap-6 rounded-3xl p-6 md:grid-cols-[1.1fr_1fr] md:p-8">
            <div className="space-y-5">
              <TextScramble text="ZENCHI ACCESS" className="neon-red" />
              <h1 className="text-4xl font-black md:text-5xl">{authView === "logout" ? "Logout" : "Google Login"}</h1>
              <p className="text-sm text-muted-foreground">One device can be bound to only one account permanently.</p>
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
                  <GradientButton className="w-full" onClick={() => void signOut()}>Confirm Logout</GradientButton>
                  <LiquidButton variant="outline" className="w-full" onClick={() => setAuthView("home")}>Cancel</LiquidButton>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Use your Gmail account. Device binding and validation happen on the server.</p>
                  <div className="flex justify-center rounded-xl border border-[#2f375f] bg-[#090d1a] p-4">
                    <div ref={googleButtonRef} />
                  </div>
                  {!googleReady ? <p className="text-xs text-muted-foreground">Loading Google Sign-In...</p> : null}
                  {authLoading ? <p className="text-xs text-muted-foreground">Authorizing...</p> : null}
                </div>
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
      <FireBall fullScreen particleCount={28} ballColor="#ff1f35" colors={FIRE_COLORS_HOME} />

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
                <GradientButton onClick={() => resumeSession()}><Rocket size={16} /> Resume Session</GradientButton>
              </div>
            </div>
          </div>

          <aside className="glass rounded-3xl p-5 md:p-7">
            <div className="relative mx-auto mb-4 h-52 w-full max-w-xs"><Globe className="-top-10" preset={globePreset} /></div>
            <div className="mb-4 flex gap-2">
              <button className={`rounded-full px-3 py-1 text-xs ${globePreset === "earth" ? "btn-red" : "glass"}`} onClick={() => setGlobePreset("earth")}>Terra</button>
              <button className={`rounded-full px-3 py-1 text-xs ${globePreset === "white" ? "btn-red" : "glass"}`} onClick={() => setGlobePreset("white")}>Nivara</button>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <p className="flex items-center gap-2"><Clock3 size={15} className="text-primary" /> Time left: {fmt(left)}</p>
              <p className="text-xs text-muted-foreground">Daily limit resets at 5:30 AM.</p>
              <p className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> Logged in as: {session?.email || email}</p>
              <p className="flex items-center gap-2"><Swords size={15} className="text-primary" /> Game launch: {playDisabled ? "Locked" : "Ready"}</p>
            </div>
          </aside>
        </div>

        <section className="mt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              className={`rounded-full px-3 py-1 text-xs ${gamePage === "home" ? "btn-red" : "glass"}`}
              onClick={() => setGamePage("home")}
            >
              All Games
            </button>
            {genres.map((genre) => (
              <button
                key={genre}
                className={`rounded-full px-3 py-1 text-xs ${gamePage === "genre" && selectedGenre === genre ? "btn-red" : "glass"}`}
                onClick={() => {
                  setSelectedGenre(genre)
                  setGamePage("genre")
                }}
              >
                {genre}
              </button>
            ))}
          </div>

          {gamePage === "genre" ? (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowLeft size={14} /> Viewing: {selectedGenre}
            </div>
          ) : null}

          <div id="games-grid" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {visibleGames.map((g) => {
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
          </div>

          <div className="mt-12">
            <div className="glass rounded-3xl p-4 md:p-8">
              <ContainerScroll
                titleComponent={
                  <>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#2f3b62] bg-[#0a1124] px-3 py-1 text-xs text-muted-foreground">
                      <LayoutTemplate size={14} className="text-primary" />
                      Game Template Scroll
                    </div>
                    <h2 className="text-3xl font-semibold text-white md:text-5xl">
                      {gamePage === "genre" ? (
                        <>
                          {selectedGenre} <span className="neon-red">Collection</span>
                        </>
                      ) : (
                        <>
                          All Games <span className="neon-red">Collection</span>
                        </>
                      )}
                    </h2>
                    <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                      Scroll section reserved for your real game artwork. For now this is a clean template preview layout.
                    </p>
                  </>
                }
              >
                <div className="mx-auto grid h-full w-full grid-cols-1 gap-4 rounded-2xl bg-[#0a1124] p-4 md:grid-cols-2">
                  {GENRE_SHOWCASE.map((item) => (
                    <button
                      key={item.genre}
                      type="button"
                      onClick={() => {
                        setSelectedGenre(item.genre)
                        setGamePage("genre")
                        document.getElementById("games-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }}
                      className="group relative min-h-[160px] overflow-hidden rounded-xl border border-[#374b86] text-left transition hover:-translate-y-0.5 hover:border-[#ff4455]"
                    >
                      <img src={item.image} alt={`${item.genre} games`} className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050913] via-[#091127bb] to-[#0a102433]" />
                      <div className="relative z-10 flex h-full flex-col justify-end p-4">
                        <p className="text-lg font-bold text-white">{item.genre}</p>
                        <p className="text-xs text-[#d2dcff]">{item.subtitle}</p>
                        <span className="mt-2 inline-flex w-fit rounded-full border border-[#5a6ab0] bg-[#111c3fb5] px-2 py-1 text-[11px] text-white/90">
                          Click to open
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </ContainerScroll>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
