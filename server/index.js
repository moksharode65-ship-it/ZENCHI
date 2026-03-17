import "dotenv/config"
import express from "express"
import cors from "cors"
import jwt from "jsonwebtoken"
import { OAuth2Client } from "google-auth-library"
import { z } from "zod"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const app = express()
app.set("trust proxy", 1)
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error("Not allowed by CORS"))
    },
    credentials: true,
  }),
)
app.use(express.json())

const PORT = Number(process.env.PORT || 8787)
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me"
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const COOKIE_NAME = "session_token"
const DEVICE_COOKIE = "device_id"
const LIMIT_MS = 6 * 60 * 60 * 1000
const GEO_RADIUS_KM = Number(process.env.GEO_RADIUS_KM || 10)
const ADMIN_KEY = process.env.ADMIN_KEY || "zenchi-admin"
const HEARTBEAT_GRACE_MS = Number(process.env.HEARTBEAT_GRACE_MS || 45000)
const IS_PROD = process.env.NODE_ENV === "production"

const dataDir = path.resolve("data")
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
const dbPath = path.join(dataDir, "zenchi-db.json")

// Credit system constants
const INITIAL_CREDITS = 1000
const CREDIT_PACKAGES = [
  { id: "starter", name: "Starter Pack", credits: 500, price: 4.99 },
  { id: "basic", name: "Basic Pack", credits: 1000, price: 8.99 },
  { id: "pro", name: "Pro Pack", credits: 2500, price: 19.99 },
  { id: "elite", name: "Elite Pack", credits: 5000, price: 34.99 },
]

// Game credit costs
const GAME_COSTS = {
  "nebula-run": 10,
  "quantum-drift": 15,
  "void-strike": 20,
  "orbit-ops": 10,
  "neo-football": 5,
  "cyber-run": 5,
  "chess": 5,
  "subway-bridge-runner": 5,
}

const readDb = () => {
  const init = {
    users: [],
    sessions: {},
    geoLocks: [],
    credits: {},
    creditTransactions: [],
    deviceBindings: {},
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(init, null, 2))
    return init
  }

  const raw = fs.readFileSync(dbPath, "utf8")
  const content = raw.trim()
  if (!content) {
    fs.writeFileSync(dbPath, JSON.stringify(init, null, 2))
    return init
  }

  try {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Database JSON is not an object")
    }
    if (!parsed.deviceBindings || typeof parsed.deviceBindings !== "object") {
      parsed.deviceBindings = {}
    }
    if (!Array.isArray(parsed.users)) parsed.users = []
    if (!parsed.sessions || typeof parsed.sessions !== "object") parsed.sessions = {}
    if (!Array.isArray(parsed.geoLocks)) parsed.geoLocks = []
    if (!parsed.credits || typeof parsed.credits !== "object") parsed.credits = {}
    if (!Array.isArray(parsed.creditTransactions)) parsed.creditTransactions = []
    return parsed
  } catch (err) {
    console.error("Error reading database file, resetting database:", err)
    try {
      const backupPath = `${dbPath}.corrupt-${Date.now()}`
      fs.renameSync(dbPath, backupPath)
    } catch {
      // If backup fails (e.g., file missing), proceed to rewrite.
    }
    fs.writeFileSync(dbPath, JSON.stringify(init, null, 2))
    return init
  }
}

const writeDb = (db) => {
  const tempPath = `${dbPath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2))
  fs.renameSync(tempPath, dbPath)
}

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

const verifyPassword = (password, stored) => {
  if (!stored || !stored.includes(":")) return false
  const [salt, key] = stored.split(":")
  const hashBuffer = crypto.scryptSync(password, salt, 64)
  const keyBuffer = Buffer.from(key, "hex")
  if (hashBuffer.length !== keyBuffer.length) return false
  return crypto.timingSafeEqual(hashBuffer, keyBuffer)
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID || undefined)

function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" })
}

function parseCookies(req) {
  const raw = req.headers.cookie || ""
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=")
    if (idx <= 0) return acc
    const k = part.slice(0, idx).trim()
    const v = decodeURIComponent(part.slice(idx + 1).trim())
    acc[k] = v
    return acc
  }, {})
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

function setDeviceCookie(res, deviceId) {
  res.cookie(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60 * 1000,
  })
}

function auth(req, res, next) {
  const header = req.headers.authorization || ""
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : ""
  const cookies = parseCookies(req)
  const cookieToken = cookies[COOKIE_NAME] || ""
  const token = bearerToken || cookieToken
  if (!token) return res.status(401).json({ error: "Missing token" })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: "Invalid token" })
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (n) => (n * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function ensureSession(db, userId) {
  if (!db.sessions[userId]) {
    db.sessions[userId] = {
      remainingMs: LIMIT_MS,
      totalUsedMs: 0,
      active: false,
      startedAt: null,
      lastLat: null,
      lastLng: null,
      heartbeatAt: null,
    }
  }
  return db.sessions[userId]
}

function flushSession(db, userId) {
  const s = ensureSession(db, userId)
  if (!s.active || !s.startedAt) return s

  const now = Date.now()
  const heartbeatAt = s.heartbeatAt || s.startedAt
  const hardStopAt = heartbeatAt + HEARTBEAT_GRACE_MS
  const effectiveNow = Math.min(now, hardStopAt)

  const elapsed = Math.max(0, effectiveNow - s.startedAt)
  s.remainingMs = Math.max(0, s.remainingMs - elapsed)
  s.totalUsedMs += elapsed

  const timeoutExpired = now > hardStopAt
  s.active = s.remainingMs > 0 && !timeoutExpired
  s.startedAt = s.active ? effectiveNow : null

  return s
}

app.get("/health", (_, res) => res.json({ ok: true }))

app.post("/auth/signup", (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Email and password (min 6 chars) required" })

  const db = readDb()
  const email = parsed.data.email.toLowerCase()
  const existing = db.users.find((u) => u.email === email)
  if (existing) return res.status(409).json({ error: "Account already exists" })

  const user = {
    id: Date.now(),
    email,
    googleSub: null,
    passwordHash: hashPassword(parsed.data.password),
    createdAt: Date.now(),
  }

  db.users.push(user)
  ensureSession(db, user.id)
  writeDb(db)

  const token = signToken(user)
  setSessionCookie(res, token)
  res.json({ token, user: { email: user.email } })
})

app.post("/auth/login", (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Email and password required" })

  const db = readDb()
  const email = parsed.data.email.toLowerCase()
  const user = db.users.find((u) => u.email === email)
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid credentials" })
  }

  ensureSession(db, user.id)
  writeDb(db)
  const token = signToken(user)
  setSessionCookie(res, token)
  res.json({ token, user: { email: user.email } })
})

app.post("/auth/google", async (req, res) => {
  const parsed = z
    .object({
      idToken: z.string().optional(),
      credential: z.string().optional(),
      email: z.string().email().optional(),
    })
    .safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid auth payload" })

  let email = parsed.data.email || ""
  let sub = ""
  const idToken = parsed.data.idToken || parsed.data.credential || ""
  const cookies = parseCookies(req)
  let deviceId = (cookies[DEVICE_COOKIE] || "").toString().trim()
  if (!deviceId) deviceId = crypto.randomUUID()

  if (GOOGLE_CLIENT_ID && idToken) {
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })
      const payload = ticket.getPayload()
      email = payload?.email || ""
      sub = payload?.sub || ""
    } catch {
      return res.status(401).json({ error: "Google token verification failed" })
    }
  }

  if (!email) return res.status(400).json({ error: "Email missing. Configure Google OAuth or pass test email." })

  const db = readDb()
  const boundUserId = db.deviceBindings[deviceId]
  if (boundUserId) {
    const boundUser = db.users.find((u) => u.id === boundUserId)
    if (boundUser && boundUser.email !== email.toLowerCase()) {
      return res.status(403).json({ error: "This device is already bound to another account" })
    }
  }
  let user = db.users.find((u) => u.email === email.toLowerCase())
  if (!user) {
    user = { id: Date.now(), email: email.toLowerCase(), googleSub: sub || null, passwordHash: null, createdAt: Date.now(), deviceId }
    db.users.push(user)
    db.deviceBindings[deviceId] = user.id
  } else {
    if (user.deviceId && user.deviceId !== deviceId) {
      return res.status(403).json({ error: "This account is already bound to a different device" })
    }
    user.deviceId = deviceId
    db.deviceBindings[deviceId] = user.id
  }
  ensureSession(db, user.id)
  writeDb(db)

  const token = signToken(user)
  setSessionCookie(res, token)
  setDeviceCookie(res, deviceId)
  res.json({ token, user: { email: user.email } })
})

app.get("/auth/me", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })
  const s = flushSession(db, user.id)
  writeDb(db)
  res.json({
    user: { email: user.email },
    session: {
      email: user.email,
      remainingMs: s.remainingMs,
      totalUsedMs: s.totalUsedMs,
      active: s.active,
      startedAt: s.startedAt,
      limitMs: LIMIT_MS,
    },
  })
})

app.post("/auth/logout", auth, (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" })
  res.json({ ok: true })
})

app.get("/session/me", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })
  const s = flushSession(db, user.id)
  writeDb(db)
  res.json({
    email: user.email,
    remainingMs: s.remainingMs,
    totalUsedMs: s.totalUsedMs,
    active: s.active,
    startedAt: s.startedAt,
    limitMs: LIMIT_MS,
  })
})

app.post("/session/start", auth, (req, res) => {
  const parsed = z.object({ lat: z.number().optional(), lng: z.number().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid location payload" })

  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  const s = flushSession(db, user.id)
  if (s.remainingMs <= 0) return res.status(403).json({ error: "6-hour limit exhausted" })

  const hasLocation = typeof parsed.data.lat === "number" && typeof parsed.data.lng === "number"
  if (hasLocation) {
    for (const lock of db.geoLocks) {
      if (lock.userId === user.id) continue
      if (haversineKm(parsed.data.lat, parsed.data.lng, lock.lat, lock.lng) <= GEO_RADIUS_KM) {
        return res.status(403).json({ error: `Another account exists within ${GEO_RADIUS_KM}km` })
      }
    }
  }

  if (hasLocation) {
    db.geoLocks.push({ id: Date.now() + Math.random(), userId: user.id, email: user.email, lat: parsed.data.lat, lng: parsed.data.lng, createdAt: Date.now() })
  }

  if (!s.active) {
    s.active = true
    s.startedAt = Date.now()
  }
  s.lastLat = hasLocation ? parsed.data.lat : s.lastLat
  s.lastLng = hasLocation ? parsed.data.lng : s.lastLng
  s.heartbeatAt = Date.now()

  writeDb(db)
  res.json({ ok: true, active: s.active, remainingMs: s.remainingMs })
})

app.post("/session/heartbeat", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  const s = flushSession(db, user.id)
  if (s.active) s.heartbeatAt = Date.now()
  writeDb(db)

  res.json({ ok: true, active: s.active, remainingMs: s.remainingMs })
})

app.post("/session/stop", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })
  const s = flushSession(db, user.id)
  s.active = false
  s.startedAt = null
  writeDb(db)
  res.json({ ok: true, remainingMs: s.remainingMs })
})

// ============ CREDIT SYSTEM ENDPOINTS ============

// Get user credit balance
app.get("/credits/balance", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  const credits = db.credits[user.id] || { balance: INITIAL_CREDITS, totalSpent: 0, transactions: [] }
  res.json(credits)
})

// Get credit packages
app.get("/credits/packages", (req, res) => {
  res.json(CREDIT_PACKAGES)
})

// Add credits (purchase)
app.post("/credits/purchase", auth, (req, res) => {
  const parsed = z.object({ packageId: z.string() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid package ID" })

  const pkg = CREDIT_PACKAGES.find((p) => p.id === parsed.data.packageId)
  if (!pkg) return res.status(400).json({ error: "Invalid package" })

  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  if (!db.credits[user.id]) {
    db.credits[user.id] = { balance: INITIAL_CREDITS, totalSpent: 0, transactions: [] }
  }

  const creditRecord = db.credits[user.id]
  creditRecord.balance += pkg.credits
  creditRecord.transactions.push({
    id: Date.now(),
    type: "purchase",
    amount: pkg.credits,
    package: pkg.name,
    timestamp: Date.now(),
  })

  writeDb(db)
  res.json({ success: true, balance: creditRecord.balance, package: pkg })
})

// Get game costs
app.get("/credits/game-costs", (req, res) => {
  res.json(GAME_COSTS)
})

// Spend credits for a game
app.post("/credits/spend", auth, (req, res) => {
  const parsed = z.object({ gameId: z.string() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid game ID" })

  const gameId = parsed.data.gameId
  const cost = GAME_COSTS[gameId]
  if (!cost) return res.status(400).json({ error: "Invalid game" })

  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  if (!db.credits[user.id]) {
    db.credits[user.id] = { balance: INITIAL_CREDITS, totalSpent: 0, transactions: [] }
  }

  const creditRecord = db.credits[user.id]
  if (creditRecord.balance < cost) {
    return res.status(403).json({ error: "Insufficient credits", required: cost, available: creditRecord.balance })
  }

  creditRecord.balance -= cost
  creditRecord.totalSpent += cost
  creditRecord.transactions.push({
    id: Date.now(),
    type: "spend",
    amount: -cost,
    gameId,
    timestamp: Date.now(),
  })

  writeDb(db)
  res.json({ success: true, balance: creditRecord.balance, spent: cost, gameId })
})

// Get credit history
app.get("/credits/history", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  const credits = db.credits[user.id] || { balance: INITIAL_CREDITS, totalSpent: 0, transactions: [] }
  res.json(credits.transactions.slice(-50).reverse())
})

// ========== DASHBOARD APIs ==========

// Get user dashboard data (credits + stats)
app.get("/api/dashboard", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  const credits = db.credits[user.id] || { balance: INITIAL_CREDITS, totalEarned: 0, totalSpent: 0, streakDays: 0, lastLogin: null }
  const stats = db.userStats?.[user.id] || { totalPlaytimeMs: 0, gamesPlayed: 0, highScores: {} }

  res.json({
    credits: credits.balance || INITIAL_CREDITS,
    totalEarned: credits.totalEarned || 0,
    totalSpent: credits.totalSpent || 0,
    streakDays: credits.streakDays || 0,
    lastLogin: credits.lastLogin || null,
    ...stats
  })
})

// Daily bonus
app.post("/api/daily-bonus", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  if (!db.credits) db.credits = {}
  if (!db.credits[user.id]) {
    db.credits[user.id] = { balance: INITIAL_CREDITS, totalEarned: 0, totalSpent: 0, streakDays: 0, lastLogin: null, transactions: [] }
  }

  const today = new Date().toISOString().split("T")[0]
  const lastLogin = db.credits[user.id].lastLogin?.split("T")[0]

  if (lastLogin === today) {
    return res.json({ alreadyClaimed: true, credits: db.credits[user.id].balance, streak: db.credits[user.id].streakDays })
  }

  let bonus = 25
  let newStreak = 1
  if (lastLogin) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]
    if (lastLogin === yesterday) {
      newStreak = (db.credits[user.id].streakDays || 0) + 1
      if (newStreak >= 7) bonus = 75
      else if (newStreak >= 3) bonus = 50
    }
  }

  db.credits[user.id].balance = (db.credits[user.id].balance || INITIAL_CREDITS) + bonus
  db.credits[user.id].totalEarned = (db.credits[user.id].totalEarned || 0) + bonus
  db.credits[user.id].streakDays = newStreak
  db.credits[user.id].lastLogin = new Date().toISOString()
  db.credits[user.id].transactions = db.credits[user.id].transactions || []
  db.credits[user.id].transactions.push({ type: "daily_bonus", amount: bonus, date: new Date().toISOString() })

  writeDb(db)
  res.json({ bonus, newStreak, totalCredits: db.credits[user.id].balance })
})

// Add playtime credits
app.post("/api/playtime", auth, (req, res) => {
  const { minutes, score } = req.body
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  if (!db.credits) db.credits = {}
  if (!db.credits[user.id]) db.credits[user.id] = { balance: INITIAL_CREDITS, totalEarned: 0, totalSpent: 0, transactions: [] }

  let earned = minutes * 1
  if (score >= 1000) earned += 50
  if (score >= 5000) earned += 100
  if (score >= 10000) earned += 200

  db.credits[user.id].balance = (db.credits[user.id].balance || INITIAL_CREDITS) + earned
  db.credits[user.id].totalEarned = (db.credits[user.id].totalEarned || 0) + earned
  db.credits[user.id].transactions = db.credits[user.id].transactions || []
  db.credits[user.id].transactions.push({ type: "playtime", amount: earned, date: new Date().toISOString() })

  writeDb(db)
  res.json({ earned })
})

// Update stats after game
app.post("/api/stats", auth, (req, res) => {
  const { gameId, playtimeMs, score } = req.body
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  if (!db.userStats) db.userStats = {}
  if (!db.userStats[user.id]) db.userStats[user.id] = { totalPlaytimeMs: 0, gamesPlayed: 0, highScores: {} }

  db.userStats[user.id].totalPlaytimeMs = (db.userStats[user.id].totalPlaytimeMs || 0) + (playtimeMs || 0)
  db.userStats[user.id].gamesPlayed = (db.userStats[user.id].gamesPlayed || 0) + 1

  const currentHigh = db.userStats[user.id].highScores?.[gameId] || 0
  if (score > currentHigh) {
    if (!db.userStats[user.id].highScores) db.userStats[user.id].highScores = {}
    db.userStats[user.id].highScores[gameId] = score
  }

  writeDb(db)
  res.json({ newHighScore: score > currentHigh, highScore: score })
})

// Achievements list
const ACHIEVEMENTS = [
  { id: "first_game", name: "First Blood", description: "Play your first game", reward: 100 },
  { id: "play_30min", name: "Warming Up", description: "Play for 30 minutes total", reward: 200 },
  { id: "play_1hr", name: "Dedicated", description: "Play for 1 hour total", reward: 500 },
  { id: "play_10hr", name: "Arcade Master", description: "Play for 10 hours total", reward: 2000 },
  { id: "streak_7", name: "Consistent", description: "7-day login streak", reward: 1000 },
  { id: "score_1k", name: "High Scorer", description: "Score 1000+ points", reward: 250 },
  { id: "score_5k", name: "Pro Gamer", description: "Score 5000+ points", reward: 500 },
  { id: "score_10k", name: "Legend", description: "Score 10000+ points", reward: 1000 },
]

app.get("/api/achievements", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  const earned = db.userAchievements?.[user.id] || []
  const result = ACHIEVEMENTS.map(a => ({ ...a, earned: earned.includes(a.id) }))
  res.json(result)
})

// Claim achievement
app.post("/api/achievements/claim", auth, (req, res) => {
  const { achievementId } = req.body
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId)
  if (!achievement) return res.status(404).json({ error: "Achievement not found" })

  if (!db.userAchievements) db.userAchievements = {}
  if (db.userAchievements[user.id]?.includes(achievementId)) {
    return res.json({ alreadyClaimed: true })
  }

  if (!db.userAchievements[user.id]) db.userAchievements[user.id] = []
  db.userAchievements[user.id].push(achievementId)

  if (!db.credits) db.credits = {}
  if (!db.credits[user.id]) db.credits[user.id] = { balance: INITIAL_CREDITS, totalEarned: 0, totalSpent: 0, transactions: [] }
  db.credits[user.id].balance = (db.credits[user.id].balance || INITIAL_CREDITS) + achievement.reward
  db.credits[user.id].totalEarned = (db.credits[user.id].totalEarned || 0) + achievement.reward
  db.credits[user.id].transactions = db.credits[user.id].transactions || []
  db.credits[user.id].transactions.push({ type: "achievement", amount: achievement.reward, date: new Date().toISOString() })

  writeDb(db)
  res.json({ claimed: true, reward: achievement.reward })
})

// Leaderboard
app.get("/api/leaderboard", (_, res) => {
  const db = readDb()
  const leaderboard = Object.entries(db.credits || {})
    .map(([uid, data]) => {
      const user = db.users.find(u => u.id === uid)
      return { email: user?.email?.split("@")[0] || "Unknown", totalEarned: data?.totalEarned || 0, streak: data?.streakDays || 0 }
    })
    .sort((a, b) => b.totalEarned - a.totalEarned)
    .slice(0, 10)
    .map((e, i) => ({ rank: i + 1, ...e }))

  res.json(leaderboard)
})

app.get("/admin/overview", (req, res) => {
  const key = req.headers["x-admin-key"]
  if (key !== ADMIN_KEY) return res.status(403).json({ error: "Forbidden" })

  const db = readDb()
  const users = db.users.length
  const activeUsers = Object.values(db.sessions).filter((s) => s.active).length
  const exhaustedUsers = Object.values(db.sessions).filter((s) => s.remainingMs <= 0).length
  const recentLocks = [...db.geoLocks].slice(-10).reverse()

  res.json({ users, activeUsers, exhaustedUsers, recentLocks, geoRadiusKm: GEO_RADIUS_KM })
})

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ZENCHI API running on 0.0.0.0:${PORT}`)
})
