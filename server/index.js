import "dotenv/config"
import express from "express"
import cors from "cors"
import jwt from "jsonwebtoken"
import { OAuth2Client } from "google-auth-library"
import { z } from "zod"
import fs from "node:fs"
import path from "node:path"

const app = express()
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }))
app.use(express.json())

const PORT = Number(process.env.PORT || 8787)
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me"
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const LIMIT_MS = 6 * 60 * 60 * 1000
const GEO_RADIUS_KM = Number(process.env.GEO_RADIUS_KM || 10)
const ADMIN_KEY = process.env.ADMIN_KEY || "zenchi-admin"

const dataDir = path.resolve("data")
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
const dbPath = path.join(dataDir, "zenchi-db.json")

const readDb = () => {
  if (!fs.existsSync(dbPath)) {
    const init = { users: [], sessions: {}, geoLocks: [] }
    fs.writeFileSync(dbPath, JSON.stringify(init, null, 2))
    return init
  }
  return JSON.parse(fs.readFileSync(dbPath, "utf8"))
}

const writeDb = (db) => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2))

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID || undefined)

function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" })
}

function auth(req, res, next) {
  const header = req.headers.authorization || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
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
    }
  }
  return db.sessions[userId]
}

function flushSession(db, userId) {
  const s = ensureSession(db, userId)
  if (!s.active || !s.startedAt) return s
  const now = Date.now()
  const elapsed = Math.max(0, now - s.startedAt)
  s.remainingMs = Math.max(0, s.remainingMs - elapsed)
  s.totalUsedMs += elapsed
  s.active = s.remainingMs > 0
  s.startedAt = s.active ? now : null
  return s
}

app.get("/health", (_, res) => res.json({ ok: true }))

app.post("/auth/google", async (req, res) => {
  const parsed = z.object({ idToken: z.string().optional(), email: z.string().email().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid auth payload" })

  let email = parsed.data.email || ""
  let sub = ""

  if (GOOGLE_CLIENT_ID && parsed.data.idToken) {
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: parsed.data.idToken, audience: GOOGLE_CLIENT_ID })
      const payload = ticket.getPayload()
      email = payload?.email || ""
      sub = payload?.sub || ""
    } catch {
      return res.status(401).json({ error: "Google token verification failed" })
    }
  }

  if (!email) return res.status(400).json({ error: "Email missing. Configure Google OAuth or pass test email." })

  const db = readDb()
  let user = db.users.find((u) => u.email === email.toLowerCase())
  if (!user) {
    user = { id: Date.now(), email: email.toLowerCase(), googleSub: sub || null, createdAt: Date.now() }
    db.users.push(user)
  }
  ensureSession(db, user.id)
  writeDb(db)

  res.json({ token: signToken(user), user: { email: user.email } })
})

app.get("/session/me", auth, (req, res) => {
  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })
  const s = flushSession(db, user.id)
  writeDb(db)
  res.json({ remainingMs: s.remainingMs, totalUsedMs: s.totalUsedMs, active: s.active, startedAt: s.startedAt, limitMs: LIMIT_MS })
})

app.post("/session/start", auth, (req, res) => {
  const parsed = z.object({ lat: z.number(), lng: z.number() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid location payload" })

  const db = readDb()
  const user = db.users.find((u) => u.id === req.user.uid)
  if (!user) return res.status(401).json({ error: "User not found" })

  const s = flushSession(db, user.id)
  if (s.remainingMs <= 0) return res.status(403).json({ error: "6-hour limit exhausted" })

  for (const lock of db.geoLocks) {
    if (lock.userId === user.id) continue
    if (haversineKm(parsed.data.lat, parsed.data.lng, lock.lat, lock.lng) <= GEO_RADIUS_KM) {
      return res.status(403).json({ error: `Another account exists within ${GEO_RADIUS_KM}km` })
    }
  }

  db.geoLocks.push({ id: Date.now() + Math.random(), userId: user.id, email: user.email, lat: parsed.data.lat, lng: parsed.data.lng, createdAt: Date.now() })

  if (!s.active) {
    s.active = true
    s.startedAt = Date.now()
    s.lastLat = parsed.data.lat
    s.lastLng = parsed.data.lng
  }

  writeDb(db)
  res.json({ ok: true, remainingMs: s.remainingMs })
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

app.listen(PORT, () => {
  console.log(`ZENCHI API running on http://localhost:${PORT}`)
})
