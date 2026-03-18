import { useEffect, useMemo, useRef, useState } from "react"
import { Globe, type GlobePreset } from "@/components/ui/globe"
import { FireBall } from "@/components/ui/fire-ball"
import { TextScramble } from "@/components/ui/text-scramble"
import { GradientButton } from "@/components/ui/gradient-button"
import { LiquidButton } from "@/components/ui/liquid-glass-button"
import { WebGLShader } from "@/components/ui/web-gl-shader"
import { Clock3, LogOut, ShieldCheck, Swords, Lock, Rocket, ArrowLeft, LayoutTemplate, LayoutDashboard, Coins, Gamepad2, Star } from "lucide-react"
import AnalyticsDashboardDemo from "@/components/ui/analytics-dashboard-demo"
import ZenchiDashboard from "@/components/ui/ZenchiDashboard"
import { ContainerScroll } from "@/components/ui/container-scroll-animation"
import { ContainerScrollAnimation, ContainerScrollInsetX, ContainerScrollScale, ContainerScrollTranslate } from "@/components/ui/scroll-trigger-animations"
import { ParallaxComponent } from "@/components/ui/parallax-scrolling"
import { GameFrame } from "@/games"

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

type CreditData = {
  balance: number
  totalSpent: number
  totalEarned: number
  transactions: Array<{
    id: number
    type: string
    amount: number
    gameId?: string
    timestamp: number
  }>
}

type AuthResponse = {
  success: boolean
  user?: { email: string }
  session?: MeResponse
}

type AuthView = "login" | "logout" | "home" | "dashboard"
type GamePage = "home" | "genre"
type Game = { id: string; title: string; genre: string; stars: string; status: "live" | "soon" }
type Review = {
  id: string
  gameId: string
  rating: number
  title: string
  body: string
  name: string
  createdAt: number
  verified: boolean
}

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
  { id: "nebula-run", title: "Nebula Run", genre: "Arcade", stars: "?????", status: "soon" },
  { id: "neo-football", title: "Neo Football 2087", genre: "Arcade", stars: "????â˜…", status: "live" },
  { id: "cyber-run", title: "Cyber Run", genre: "Arcade", stars: "????â˜…", status: "live" },
  { id: "chess", title: "Chess", genre: "Puzzle", stars: "????â˜…", status: "live" },
  { id: "subway-bridge-runner", title: "Subway Bridge Runner", genre: "Race", stars: "????â˜…", status: "live" },
  { id: "quantum-drift", title: "Quantum Drift", genre: "Race", stars: "?????", status: "soon" },
  { id: "void-striker-ii", title: "Void Striker II", genre: "Shooter", stars: "????⭐", status: "live" },
  { id: "orbit-ops", title: "Orbit Ops", genre: "Puzzle", stars: "?????", status: "soon" },
]

const FIRE_COLORS_AUTH = ["#ff233b", "#8a2be2", "#f44336"]
const FIRE_COLORS_HOME = ["#ff233b", "#1161ff", "#8a2be2"]
const REVIEW_STORAGE_KEY = "zenchi_reviews_v1"
const TOKEN_STORAGE_KEY = "zenchi_token_v1"

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

function loadReviews(): Review[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r) => r && typeof r === "object")
  } catch {
    return []
  }
}

function saveReviews(reviews: Review[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviews))
  } catch {
    // ignore storage failures
  }
}

function loadToken() {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || ""
  } catch {
    return ""
  }
}

function saveToken(token: string) {
  if (typeof window === "undefined") return
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {
    // ignore storage failures
  }
}

function RatingStars({ rating, size = 16 }: { rating: number; size?: number }) {
  const full = Math.round(Math.max(0, Math.min(5, rating)))
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full
        return (
          <Star
            key={i}
            size={size}
            className={filled ? "text-yellow-400" : "text-slate-600"}
            strokeWidth={1.6}
            fill={filled ? "currentColor" : "none"}
          />
        )
      })}
    </div>
  )
}

function formatReviewDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

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
  const [activeGame, setActiveGame] = useState<string | null>(null)
  const [autoLogoutDone, setAutoLogoutDone] = useState(false)
  const [autoResumeTried, setAutoResumeTried] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authToken, setAuthToken] = useState(() => loadToken())
  const [credits, setCredits] = useState<CreditData | null>(null)
  const [gamesPlayed, setGamesPlayed] = useState<Record<string, number>>({})
  const [reviews, setReviews] = useState<Review[]>(() => loadReviews())
  const [reviewGameId, setReviewGameId] = useState<string>(() => GAMES.find((g) => g.status === "live")?.id || GAMES[0]?.id || "")
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewTitle, setReviewTitle] = useState("")
  const [reviewBody, setReviewBody] = useState("")
  const [reviewName, setReviewName] = useState("")
  const [reviewMessage, setReviewMessage] = useState("")
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
  const reviewStats = useMemo(() => {
    const map: Record<string, { avg: number; count: number }> = {}
    for (const r of reviews) {
      if (!map[r.gameId]) {
        map[r.gameId] = { avg: 0, count: 0 }
      }
      map[r.gameId].avg += r.rating
      map[r.gameId].count += 1
    }
    Object.values(map).forEach((entry) => {
      entry.avg = entry.count ? Number((entry.avg / entry.count).toFixed(1)) : 0
    })
    return map
  }, [reviews])
  const reviewsForSelectedGame = useMemo(
    () => reviews.filter((r) => r.gameId === reviewGameId).slice(0, 6),
    [reviews, reviewGameId],
  )
  const recentReviews = useMemo(
    () => [...reviews].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4),
    [reviews],
  )

  const api = async (path: string, method = "GET", body?: unknown, keepalive?: boolean) => {
    const headers: Record<string, string> = {}
    if (body) headers["Content-Type"] = "application/json"
    if (authToken) headers.Authorization = `Bearer ${authToken}`

    const res = await fetch(`${API}${path}`, {
      method,
      credentials: "include",
      headers: Object.keys(headers).length ? headers : undefined,
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

  const fetchCredits = async () => {
    try {
      const creditData = (await api("/credits/balance")) as CreditData
      setCredits(creditData)
    } catch {
      // ignore
    }
  }

  const fetchGameCosts = async () => {
    try {
      const costs = (await api("/credits/game-costs")) as Record<string, number>
      return costs
    } catch {
      return {}
    }
  }

  const spendCreditsForGame = async (gameId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = (await api("/credits/spend", "POST", { gameId })) as { success: boolean; error?: string }
      if (result.success) {
        await fetchCredits()
      }
      return result
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to spend credits" }
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
      await fetchCredits()
      // Fetch games played
      try {
        const stats = (await api("/api/dashboard")) as { gamesPlayed: number }
        setGamesPlayed({ total: stats.gamesPlayed || 0 })
      } catch { }
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

      const token = (data as { token?: string }).token || ""
      setEmail(accountEmail)
      setAuthToken(token)
      saveToken(token)
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
    if (!reviewName && email) {
      setReviewName(email.split("@")[0])
    }
  }, [email, reviewName])

  useEffect(() => {
    saveReviews(reviews)
  }, [reviews])

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
    setAuthToken("")
    saveToken("")
    setAuthView("login")
    setMessage(logoutMessage)
  }

  const submitReview = () => {
    setReviewMessage("")
    if (!reviewGameId) {
      setReviewMessage("Select a game to review.")
      return
    }
    if (reviewRating < 1 || reviewRating > 5) {
      setReviewMessage("Pick a star rating.")
      return
    }
    if (reviewTitle.trim().length < 3) {
      setReviewMessage("Add a short title (min 3 chars).")
      return
    }
    if (reviewBody.trim().length < 10) {
      setReviewMessage("Write a few more words (min 10 chars).")
      return
    }

    const id = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    const verified = (gamesPlayed.total ?? 0) > 0
    const name = reviewName.trim() ? reviewName.trim() : "Anonymous"

    const newReview: Review = {
      id,
      gameId: reviewGameId,
      rating: reviewRating,
      title: reviewTitle.trim(),
      body: reviewBody.trim(),
      name,
      createdAt: Date.now(),
      verified,
    }

    setReviews((prev) => [newReview, ...prev])
    setReviewTitle("")
    setReviewBody("")
    setReviewMessage("Thanks for the review.")
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
          {activeGame ? (
            <button
              onClick={() => setActiveGame(null)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
            >
              <ArrowLeft size={16} /> Back to Arcade
            </button>
          ) : (
            <TextScramble text="ZENCHI ARCADE" className="neon-red" />
          )}
          {!activeGame && (
            <div className="flex items-center gap-2">
              <LiquidButton
                variant={authView === "dashboard" ? "default" : "outline"}
                size="default"
                onClick={() => setAuthView(authView === "dashboard" ? "home" : "dashboard")}
              >
                <LayoutDashboard size={14} /> Dashboard
              </LiquidButton>
              <LiquidButton variant="outline" size="default" onClick={() => setAuthView("logout")}>
                <LogOut size={14} /> Logout Page
              </LiquidButton>
            </div>
          )}
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
              <p className="flex items-center gap-2"><Coins size={15} className="text-yellow-400" /> Credits: {credits?.balance ?? "â€”"}</p>
              <p className="flex items-center gap-2"><Gamepad2 size={15} className="text-purple-400" /> Games played: {gamesPlayed.total ?? 0}</p>
              <p className="text-xs text-muted-foreground">Daily limit resets at 5:30 AM.</p>
              <p className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> Logged in as: {session?.email || email}</p>
              <p className="flex items-center gap-2"><Swords size={15} className="text-primary" /> Game launch: {playDisabled ? "Locked" : "Ready"}</p>
            </div>
          </aside>
        </div>

        {activeGame && session?.active && left > 0 ? (
          <div className="mt-8 flex justify-center">
            {activeGame === "neo-football" && (
              <GameFrame
                gamePath="/neo-football.html"
                title="âš½ Neo Football 2087"
                isActive={session?.active && left > 0}
                onClose={() => {
                  setActiveGame(null)
                  // Refresh stats after game
                  refreshSession()
                  fetchCredits()
                  try {
                    api("/api/dashboard").then((stats) => {
                      setGamesPlayed({ total: (stats as { gamesPlayed?: number }).gamesPlayed || 0 })
                    })
                  } catch { }
                }}
                authToken={authToken}
                gameId="neo-football"
              />
            )}
            {activeGame === "cyber-run" && (
              <GameFrame
                gamePath="/cyberpunk-game.html"
                title="ðŸŒƒ Cyberpunk Neon Dominion"
                isActive={session?.active && left > 0}
                onClose={() => {
                  setActiveGame(null)
                  // Refresh stats after game
                  refreshSession()
                  fetchCredits()
                  try {
                    api("/api/dashboard").then((stats) => {
                      setGamesPlayed({ total: (stats as { gamesPlayed?: number }).gamesPlayed || 0 })
                    })
                  } catch { }
                }}
                authToken={authToken}
                gameId="cyber-run"
              />
            )}
            {activeGame === "chess" && (
              <GameFrame
                gamePath="/chess-game.html"
                title="â™Ÿï¸ Chess"
                isActive={session?.active && left > 0}
                onClose={() => {
                  setActiveGame(null)
                  // Refresh stats after game
                  refreshSession()
                  fetchCredits()
                  try {
                    api("/api/dashboard").then((stats) => {
                      setGamesPlayed({ total: (stats as { gamesPlayed?: number }).gamesPlayed || 0 })
                    })
                  } catch { }
                }}
                authToken={authToken}
                gameId="chess"
              />
            )}
            {activeGame === "subway-bridge-runner" && (
              <GameFrame
                gamePath="/subway-bridge-runner.html"
                title="ðŸš‡ Subway Bridge Runner"
                isActive={session?.active && left > 0}
                onClose={() => {
                  setActiveGame(null)
                  // Refresh stats after game
                  refreshSession()
                  fetchCredits()
                  try {
                    api("/api/dashboard").then((stats) => {
                      setGamesPlayed({ total: (stats as { gamesPlayed?: number }).gamesPlayed || 0 })
                    })
                  } catch { }
                }}
                authToken={authToken}
                gameId="subway-bridge-runner"
              />
            )}
            {activeGame === "void-striker-ii" && (
              <GameFrame
                gamePath="/void-striker-ii.html"
                title="🎮 Void Striker II"
                isActive={session?.active && left > 0}
                onClose={() => {
                  setActiveGame(null)
                  refreshSession()
                  fetchCredits()
                  try {
                    api("/api/dashboard").then((stats) => {
                      setGamesPlayed({ total: (stats as { gamesPlayed?: number }).gamesPlayed || 0 })
                    })
                  } catch { }
                }}
                authToken={authToken}
                gameId="void-striker-ii"
              />
            )}
          </div>
        ) : authView === "dashboard" ? (
          <div className="mt-8">
            <ZenchiDashboard
              isAuthenticated={!!session}
              authToken={authToken}
            />
          </div>
        ) : (
          <section className="mt-6">
            {/* Show games when genre is selected */}
            {gamePage === "genre" && (
              <>
                <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowLeft size={14} /> Viewing: {selectedGenre}
                </div>
                <div id="games-grid" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {visibleGames.map((g) => {
                    const locked = playDisabled || g.status === "soon"
                    const gameCosts: Record<string, number> = { "nebula-run": 10, "quantum-drift": 15, "void-strike": 20, "orbit-ops": 10, "neo-football": 5, "cyber-run": 5, "subway-bridge-runner": 5, "void-striker-ii": 5 }
                    const cost = gameCosts[g.id] || 5
                    return (
                      <article key={g.id} className="glass rounded-2xl p-4">
                        <p className="text-xs text-muted-foreground">{g.genre}</p>
                        <h3 className="mt-1 text-lg font-semibold">{g.title}</h3>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <RatingStars rating={reviewStats[g.id]?.avg || 0} size={12} />
                          <span>
                            {reviewStats[g.id]?.count ? `${reviewStats[g.id]?.avg} (${reviewStats[g.id]?.count})` : "New"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-yellow-400 flex items-center gap-1"><Coins size={12} /> {cost} credits</span>
                          {credits && credits.balance < cost && <span className="text-xs text-red-400">Insufficient</span>}
                        </div>
                        <button
                          className="mt-4 w-full rounded-xl border border-[#37406d] px-3 py-2 text-sm hover:bg-[#ff233b] hover:border-[#ff233b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={locked || (!!credits && credits.balance < cost)}
                          onClick={async () => {
                            if (g.status === "live") {
                              // Spend credits before playing
                              if (cost > 0 && credits && credits.balance >= cost) {
                                const result = await spendCreditsForGame(g.id)
                                if (!result.success) {
                                  setMessage(result.error || "Credit deduction failed")
                                  return
                                }
                              }
                              setActiveGame(g.id)
                            }
                          }}
                        >
                          {locked ? <span className="inline-flex items-center gap-2"><Lock size={14} /> Locked</span> : "Play"}
                        </button>
                      </article>
                    )
                  })}
                </div>
              </>
            )}

            {/* Scroll Animations - Always Visible */}
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

              {/* Scroll Trigger Animations Gallery */}
              <div className="glass rounded-3xl p-4 md:p-8 -mt-4">
                <ContainerScrollAnimation className="overflow-hidden rounded-2xl">
                  <ContainerScrollTranslate className="h-[80vh] relative">
                    <ContainerScrollInsetX className="h-full relative">
                      <ContainerScrollScale className="flex gap-3 overflow-x-auto px-4 py-8 bg-[#0a1124] rounded-xl">
                        {[
                          "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&h=400&fit=crop",
                          "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&h=400&fit=crop",
                          "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&h=400&fit=crop",
                          "https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=600&h=400&fit=crop",
                          "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop",
                        ].map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt={`Game ${i + 1}`}
                            className="aspect-[3/2] h-[200px] md:h-[280px] w-auto rounded-xl object-cover shrink-0"
                          />
                        ))}
                      </ContainerScrollScale>
                    </ContainerScrollInsetX>
                  </ContainerScrollTranslate>
                </ContainerScrollAnimation>
              </div>

              {/* Parallax Section */}
              <div className="glass rounded-3xl p-4 md:p-8 -mt-4">
                <ParallaxComponent />
              </div>
            </div>

            {/* Reviews */}
            <div className="mt-12 glass rounded-3xl p-5 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">player feedback</p>
                  <h2 className="mt-2 text-2xl font-semibold md:text-3xl">Review System</h2>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    Share ratings and short feedback to help balance difficulty, rewards, and game feel.
                  </p>
                </div>
                <div className="glass rounded-2xl px-4 py-3">
                  <p className="text-xs text-muted-foreground">Total reviews</p>
                  <p className="text-2xl font-semibold">{reviews.length}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                <div className="space-y-4">
                  <div className="glass rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground">Select game</p>
                    <select
                      value={reviewGameId}
                      onChange={(e) => setReviewGameId(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#2f3b62] bg-[#0a1124] px-3 py-2 text-sm text-white"
                    >
                      {GAMES.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title} {g.status === "soon" ? "(Soon)" : ""}
                        </option>
                      ))}
                    </select>

                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Your rating</span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const star = i + 1
                          const filled = star <= reviewRating
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              className="rounded-full p-1"
                            >
                              <Star
                                size={18}
                                className={filled ? "text-yellow-400" : "text-slate-600"}
                                strokeWidth={1.6}
                                fill={filled ? "currentColor" : "none"}
                              />
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <input
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder="Display name"
                        className="w-full rounded-xl border border-[#2f3b62] bg-[#0a1124] px-3 py-2 text-sm text-white"
                      />
                      <input
                        value={reviewTitle}
                        onChange={(e) => setReviewTitle(e.target.value)}
                        placeholder="Title"
                        className="w-full rounded-xl border border-[#2f3b62] bg-[#0a1124] px-3 py-2 text-sm text-white"
                      />
                      <textarea
                        value={reviewBody}
                        onChange={(e) => setReviewBody(e.target.value)}
                        placeholder="What did you like or want improved?"
                        rows={4}
                        className="w-full rounded-xl border border-[#2f3b62] bg-[#0a1124] px-3 py-2 text-sm text-white"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <GradientButton onClick={submitReview}>Submit Review</GradientButton>
                        <p className="text-xs text-muted-foreground">{reviewMessage}</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Selected game rating</p>
                        <div className="mt-1 flex items-center gap-2">
                          <RatingStars rating={reviewStats[reviewGameId]?.avg || 0} size={14} />
                          <span className="text-sm">
                            {reviewStats[reviewGameId]?.count ? `${reviewStats[reviewGameId]?.avg} / 5` : "No ratings yet"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Reviews</p>
                        <p className="text-lg font-semibold">{reviewStats[reviewGameId]?.count || 0}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {reviewsForSelectedGame.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No reviews yet. Be the first.</p>
                      ) : (
                        reviewsForSelectedGame.map((review) => (
                          <div key={review.id} className="rounded-xl border border-[#26335d] bg-[#0a1124] p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">{review.title}</p>
                              <RatingStars rating={review.rating} size={12} />
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">{review.body}</p>
                            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>{review.name}{review.verified ? " - Verified" : ""}</span>
                              <span>{formatReviewDate(review.createdAt)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="glass rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground">Recent reviews</p>
                    <div className="mt-3 grid gap-3">
                      {recentReviews.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No recent reviews.</p>
                      ) : (
                        recentReviews.map((review) => {
                          const gameName = GAMES.find((g) => g.id === review.gameId)?.title || "Unknown"
                          return (
                            <div key={review.id} className="rounded-xl border border-[#26335d] bg-[#0a1124] p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-semibold">{review.title}</p>
                                  <p className="text-[11px] text-muted-foreground">{gameName}</p>
                                </div>
                                <RatingStars rating={review.rating} size={12} />
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">{review.body}</p>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="glass rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground">Ideas to amplify feedback</p>
                    <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                      <li>Prompt after each game with a 1-tap rating.</li>
                      <li>Tag reviews by theme: performance, difficulty, rewards.</li>
                      <li>Auto-suggest fixes if rating is 2 stars or below.</li>
                      <li>Show changelog notes tied to top complaints.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}





