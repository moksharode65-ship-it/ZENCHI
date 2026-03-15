import 'dotenv/config';
import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Debug: check if env loaded
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'loaded' : 'missing');

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);
app.use(bodyParser.json());
app.use(cookieParser());

// ---------- SQLite DB ----------
const db = new sqlite3.Database('./auth.db', (err) => {
    if (err) {
        console.error('Failed to open DB', err);
        process.exit(1);
    }
    console.log('Database opened');
});

// Create tables in sequence
db.serialize(() => {
    // Create users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        device_id TEXT UNIQUE,
        current_session_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Create credits table
    db.run(`CREATE TABLE IF NOT EXISTS user_credits (
        email TEXT PRIMARY KEY,
        credits INTEGER DEFAULT 0,
        total_earned INTEGER DEFAULT 0,
        total_spent INTEGER DEFAULT 0,
        streak_days INTEGER DEFAULT 0,
        last_login TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Create achievements table
    db.run(`CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        credit_reward INTEGER DEFAULT 0
    )`);
    
    // Create user achievements table
    db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
        email TEXT,
        achievement_id TEXT,
        earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (email, achievement_id)
    )`);
    
    // Create stats table
    db.run(`CREATE TABLE IF NOT EXISTS user_stats (
        email TEXT PRIMARY KEY,
        total_playtime_ms INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        high_scores TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Create chess games table
    db.run(`CREATE TABLE IF NOT EXISTS chess_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        fen TEXT NOT NULL,
        player_email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Create chess moves table
    db.run(`CREATE TABLE IF NOT EXISTS chess_moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId INTEGER NOT NULL,
        notation TEXT NOT NULL,
        fen TEXT,
        player_email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(gameId) REFERENCES chess_games(id) ON DELETE CASCADE
    )`);
    
    console.log('Tables created');
    
    // Seed default achievements
    const defaultAchievements = [
        { id: 'first_game', name: 'First Blood', description: 'Play your first game', credit_reward: 100 },
        { id: 'play_30min', name: 'Warming Up', description: 'Play for 30 minutes total', credit_reward: 200 },
        { id: 'play_1hr', name: 'Dedicated', description: 'Play for 1 hour total', credit_reward: 500 },
        { id: 'play_10hr', name: 'Arcade Master', description: 'Play for 10 hours total', credit_reward: 2000 },
        { id: 'streak_7', name: 'Consistent', description: '7-day login streak', credit_reward: 1000 },
        { id: 'score_1k', name: 'High Scorer', description: 'Score 1000+ points in a game', credit_reward: 250 },
        { id: 'score_5k', name: 'Pro Gamer', description: 'Score 5000+ points in a game', credit_reward: 500 },
        { id: 'score_10k', name: 'Legend', description: 'Score 10000+ points in a game', credit_reward: 1000 },
    ];
    
    const stmt = db.prepare('INSERT OR IGNORE INTO achievements (id, name, description, credit_reward) VALUES (?, ?, ?, ?)');
    defaultAchievements.forEach(ach => {
        stmt.run(ach.id, ach.name, ach.description, ach.credit_reward);
    });
    stmt.finalize();
    console.log('Achievements seeded');
});

// ---------- Passport Google OAuth ----------
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
}, (accessToken, refreshToken, profile, done) => {
    // We only need the email address
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;
    if (!email) return done(new Error('No email found in Google profile'));
    return done(null, { email });
}));

passport.serializeUser((user, done) => done(null, user.email));
passport.deserializeUser((email, done) => done(null, { email }));

app.use(passport.initialize());

// ---------- Helper Functions ----------
function hashDeviceInfo(info) {
    // Simple SHA-256 hash of concatenated info
    return crypto.createHash('sha256').update(info).digest('hex');
}

function generateJwt(email) {
    const payload = { email };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function verifyJwt(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// ---------- Routes ----------
app.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

// Handle Google credential login from frontend
app.post('/auth/google', async (req, res) => {
    const { credential, fingerprint } = req.body;
    
    if (!credential) {
        return res.status(400).json({ error: 'Missing credential' });
    }
    
    // For now, just extract email from the JWT credential (client-side ID token)
    // In production, you should verify the token with Google
    try {
        // Decode the JWT to get email (not secure for production, but works for demo)
        const payload = JSON.parse(Buffer.from(credential.split('.')[1], 'base64').toString());
        const email = payload.email;
        
        if (!email) {
            return res.status(400).json({ error: 'No email in credential' });
        }
        
        // Create or update user with device fingerprint
        const deviceInfo = fingerprint ? JSON.stringify(fingerprint) : 'default-device';
        const deviceId = hashDeviceInfo(deviceInfo);
        
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            
            const token = generateJwt(email);
            
            if (!row) {
                // New user - create account and bind device
                db.run('INSERT INTO users (email, device_id, current_session_token) VALUES (?, ?, ?)', 
                    [email, deviceId, token], function (err) {
                        if (err) {
                            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                                return res.status(403).json({ error: 'This device is linked to another account' });
                            }
                            return res.status(500).json({ error: 'Failed to create user' });
                        }
                        
                        // Initialize user credits
                        db.run('INSERT INTO user_credits (email, credits, last_login) VALUES (?, ?, ?)', 
                            [email, 0, new Date().toISOString()]);
                        
                        // Initialize user stats
                        db.run('INSERT INTO user_stats (email) VALUES (?)', [email]);
                        
                        res.cookie('session_token', token, { httpOnly: true, sameSite: IS_PROD ? 'none' : 'lax', secure: IS_PROD });
                        return res.json({ 
                            success: true, 
                            user: { email },
                            session: {
                                email,
                                remainingMs: 3600000,
                                totalUsedMs: 0,
                                active: true,
                                startedAt: null,
                                limitMs: 3600000
                            }
                        });
                    });
            } else {
                // Existing user - check device
                if (row.device_id && row.device_id !== deviceId) {
                    return res.status(403).json({ error: 'This device is linked to another account' });
                }
                
                // Update session
                const updateSQL = row.device_id 
                    ? 'UPDATE users SET current_session_token = ? WHERE email = ?'
                    : 'UPDATE users SET current_session_token = ?, device_id = ? WHERE email = ?';
                
                const params = row.device_id ? [token, email] : [token, deviceId, email];
                
                db.run(updateSQL, params, function (err) {
                    if (err) return res.status(500).json({ error: 'Failed to update session' });
                    
                    res.cookie('session_token', token, { httpOnly: true, sameSite: IS_PROD ? 'none' : 'lax', secure: IS_PROD });
                    return res.json({ 
                        success: true, 
                        user: { email },
                        session: {
                            email,
                            remainingMs: 3600000,
                            totalUsedMs: 0,
                            active: true,
                            startedAt: null,
                            limitMs: 3600000
                        }
                    });
                });
            }
        });
    } catch (e) {
        return res.status(400).json({ error: 'Invalid credential' });
    }
});

app.get('/auth/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login-failure' }), (req, res) => {
    // After Google login, the frontend should compute device fingerprint and POST to /auth/verify
    // We send a simple JSON indicating the Google login succeeded and include the email
    res.json({ success: true, email: req.user.email });
});

// Verify device fingerprint and issue session token
app.post('/auth/verify', async (req, res) => {
    const { email, deviceInfo } = req.body; // deviceInfo is a string from client (e.g., concatenated fingerprint data)
    if (!email || !deviceInfo) return res.status(400).json({ error: 'Missing email or deviceInfo' });

    const deviceId = hashDeviceInfo(deviceInfo);

    // Look up user by email
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) {
            // First login for this email – create user with deviceId
            const insertSQL = 'INSERT INTO users (email, device_id, current_session_token) VALUES (?, ?, ?)';
            const token = generateJwt(email);
            db.run(insertSQL, [email, deviceId, token], function (err) {
                if (err) return res.status(500).json({ error: 'Failed to create user' });
                // Set HTTP‑only cookie
                res.cookie('session_token', token, { httpOnly: true, sameSite: IS_PROD ? 'none' : 'lax', secure: IS_PROD });
                return res.json({ success: true, message: 'User created and logged in' });
            });
        } else {
            // User exists – check device binding
            if (row.device_id && row.device_id !== deviceId) {
                // Device bound to a different email
                return res.status(403).json({ error: 'This device is already registered with another account.' });
            }
            // Device matches or not yet set (should not happen because device_id is UNIQUE)
            const token = generateJwt(email);
            const updateSQL = 'UPDATE users SET current_session_token = ?, device_id = ? WHERE email = ?';
            db.run(updateSQL, [token, deviceId, email], function (err) {
                if (err) return res.status(500).json({ error: 'Failed to update session' });
                // Overwrite previous cookie
                res.cookie('session_token', token, { httpOnly: true, sameSite: IS_PROD ? 'none' : 'lax', secure: IS_PROD });
                return res.json({ success: true, message: 'Logged in successfully' });
            });
        }
    });
});

// Middleware to protect routes
function authMiddleware(req, res, next) {
    const token = req.cookies.session_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = verifyJwt(token);
    if (!payload) return res.status(401).json({ error: 'Invalid token' });
    // Verify token matches DB entry for extra safety
    db.get('SELECT current_session_token FROM users WHERE email = ?', [payload.email], (err, row) => {
        if (err || !row || row.current_session_token !== token) {
            return res.status(401).json({ error: 'Session invalidated' });
        }
        req.user = { email: payload.email };
        next();
    });
}

// Example protected route
app.get('/protected', authMiddleware, (req, res) => {
    res.json({ message: `Hello ${req.user.email}, you are authenticated!` });
});

// ========== CREDIT SYSTEM API ==========

// Get user credits and stats
app.get('/api/credits', authMiddleware, (req, res) => {
    const email = req.user.email;
    
    db.get('SELECT * FROM user_credits WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        if (!row) {
            // Initialize user credits
            db.run('INSERT INTO user_credits (email, credits, last_login) VALUES (?, ?, ?)', 
                [email, 0, new Date().toISOString()]);
            return res.json({ credits: 0, total_earned: 0, total_spent: 0, streak_days: 0 });
        }
        
        res.json({
            credits: row.credits,
            total_earned: row.total_earned,
            total_spent: row.total_spent,
            streak_days: row.streak_days,
            last_login: row.last_login
        });
    });
});

// Daily login bonus
app.post('/api/credits/daily', authMiddleware, (req, res) => {
    const email = req.user.email;
    const today = new Date().toISOString().split('T')[0];
    
    db.get('SELECT * FROM user_credits WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        let bonus = 25; // Base daily bonus
        let newStreak = 1;
        
        if (row && row.last_login) {
            const lastLogin = row.last_login.split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().split('T')[0];
            
            if (lastLogin === yesterday) {
                // Consecutive day - increase streak
                newStreak = row.streak_days + 1;
                if (newStreak >= 7) bonus = 75; // 3x bonus at 7 days
                else if (newStreak >= 3) bonus = 50; // 2x bonus at 3 days
            } else if (lastLogin === today) {
                // Already claimed today
                return res.json({ already_claimed: true, credits: row.credits, streak: row.streak_days });
            }
        }
        
        // Update credits
        db.run('UPDATE user_credits SET credits = credits + ?, total_earned = total_earned + ?, streak_days = ?, last_login = ? WHERE email = ?',
            [bonus, bonus, newStreak, today, email], (err) => {
                if (err) return res.status(500).json({ error: 'Failed to update credits' });
                res.json({ bonus, new_streak: newStreak, total_credits: row ? row.credits + bonus : bonus });
            });
    });
});

// Add credits for gameplay
app.post('/api/credits/play', authMiddleware, (req, res) => {
    const email = req.user.email;
    const { minutes_played, score } = req.body;
    
    let credits_earned = minutes_played * 1; // 1 credit per minute
    
    if (score >= 1000) credits_earned += 50;
    if (score >= 5000) credits_earned += 100;
    if (score >= 10000) credits_earned += 200;
    
    db.run('UPDATE user_credits SET credits = credits + ?, total_earned = total_earned + ? WHERE email = ?',
        [credits_earned, credits_earned, email], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to add credits' });
            res.json({ credits_earned });
        });
});

// Get achievements
app.get('/api/achievements', authMiddleware, (req, res) => {
    const email = req.user.email;
    
    db.all('SELECT * FROM achievements', [], (err, allAchievements) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        db.all('SELECT achievement_id FROM user_achievements WHERE email = ?', [email], (err, earned) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            
            const earnedIds = new Set(earned.map(e => e.achievement_id));
            const result = allAchievements.map(a => ({
                ...a,
                earned: earnedIds.has(a.id)
            }));
            
            res.json(result);
        });
    });
});

// Check and award achievements
app.post('/api/achievements/check', authMiddleware, (req, res) => {
    const email = req.user.email;
    const { achievement_id } = req.body;
    
    // Check if already earned
    db.get('SELECT * FROM user_achievements WHERE email = ? AND achievement_id = ?', [email, achievement_id], (err, row) => {
        if (row) return res.json({ already_earned: true });
        
        // Get achievement details
        db.get('SELECT * FROM achievements WHERE id = ?', [achievement_id], (err, achievement) => {
            if (!achievement) return res.status(404).json({ error: 'Achievement not found' });
            
            // Award achievement and credits
            db.run('INSERT INTO user_achievements (email, achievement_id) VALUES (?, ?)', [email, achievement_id]);
            db.run('UPDATE user_credits SET credits = credits + ? WHERE email = ?', [achievement.credit_reward, email]);
            
            res.json({ 
                earned: true, 
                achievement: achievement.name, 
                credits_rewarded: achievement.credit_reward 
            });
        });
    });
});

// Get user stats
app.get('/api/stats', authMiddleware, (req, res) => {
    const email = req.user.email;
    
    db.get('SELECT * FROM user_stats WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        if (!row) {
            db.run('INSERT INTO user_stats (email) VALUES (?)', [email]);
            return res.json({ total_playtime_ms: 0, games_played: 0, high_scores: {} });
        }
        
        res.json({
            total_playtime_ms: row.total_playtime_ms,
            games_played: row.games_played,
            high_scores: JSON.parse(row.high_scores || '{}')
        });
    });
});

// Update stats after gameplay
app.post('/api/stats/update', authMiddleware, (req, res) => {
    const email = req.user.email;
    const { game_id, playtime_ms, score } = req.body;
    
    db.get('SELECT * FROM user_stats WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        let highScores = row ? JSON.parse(row.high_scores || '{}') : {};
        const currentHigh = highScores[game_id] || 0;
        
        if (score > currentHigh) {
            highScores[game_id] = score;
        }
        
        if (row) {
            db.run('UPDATE user_stats SET total_playtime_ms = total_playtime_ms + ?, games_played = games_played + 1, high_scores = ?, updated_at = ? WHERE email = ?',
                [playtime_ms, JSON.stringify(highScores), new Date().toISOString(), email]);
        } else {
            db.run('INSERT INTO user_stats (email, total_playtime_ms, games_played, high_scores) VALUES (?, ?, 1, ?)',
                [email, playtime_ms, JSON.stringify(highScores)]);
        }
        
        res.json({ new_high_score: score > currentHigh, high_score: highScores[game_id] });
    });
});

// Leaderboard - top players by total earned
app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT email, total_earned, streak_days FROM user_credits ORDER BY total_earned DESC LIMIT 10', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows.map((r, i) => ({ rank: i + 1, email: r.email.split('@')[0], ...r })));
    });
});

// ========== Frontend-Compatible Endpoints ==========

// Check if authenticated
app.get('/auth/me', authMiddleware, (req, res) => {
    res.json({ 
        user: { email: req.user.email },
        session: {
            email: req.user.email,
            remainingMs: 3600000, // 1 hour default
            totalUsedMs: 0,
            active: true,
            startedAt: null,
            limitMs: 3600000
        }
    });
});

// Session info
app.get('/session/me', authMiddleware, (req, res) => {
    res.json({
        email: req.user.email,
        remainingMs: 3600000,
        totalUsedMs: 0,
        active: true,
        startedAt: null,
        limitMs: 3600000
    });
});

// Credits balance
app.get('/credits/balance', authMiddleware, (req, res) => {
    const email = req.user.email;
    db.get('SELECT * FROM user_credits WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        if (!row) {
            return res.json({ 
                balance: 0, 
                totalSpent: 0, 
                totalEarned: 0, 
                transactions: [] 
            });
        }
        
        res.json({ 
            balance: row.credits, 
            totalSpent: row.total_spent, 
            totalEarned: row.total_earned, 
            transactions: [] 
        });
    });
});

// Game costs
app.get('/credits/game-costs', authMiddleware, (req, res) => {
    // All games free for now
    res.json({});
});

// Spend credits for game
app.post('/credits/spend', authMiddleware, (req, res) => {
    // Games are free
    res.json({ success: true });
});

// ========== Chess Game Routes ==========

// Get all chess games
app.get('/api/chess/games', authMiddleware, (req, res) => {
    db.all('SELECT id, name, fen, created_at FROM chess_games ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ games: rows || [] });
    });
});

// Get single chess game
app.get('/api/chess/games/:gameId', authMiddleware, (req, res) => {
    db.get('SELECT id, name, fen, created_at FROM chess_games WHERE id = ?', [req.params.gameId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(404).json({ error: 'Game not found' });
        res.json(row);
    });
});

// Get moves for a chess game
app.get('/api/chess/games/:gameId/moves', authMiddleware, (req, res) => {
    db.all('SELECT id, notation, fen, created_at FROM chess_moves WHERE gameId = ? ORDER BY id ASC', [req.params.gameId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ moves: rows || [] });
    });
});

// Create new chess game
app.post('/api/chess/games', authMiddleware, (req, res) => {
    const { name, fen } = req.body;
    const email = req.user.email;
    const defaultFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
    
    db.run('INSERT INTO chess_games (name, fen, player_email) VALUES (?, ?, ?)', 
        [name || 'New Game', fen || defaultFen, email], 
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.get('SELECT id, name, fen, created_at FROM chess_games WHERE id = ?', [this.lastID], (err, row) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.status(201).json(row);
            });
        }
    );
});

// Record a chess move
app.post('/api/chess/games/:gameId/moves', authMiddleware, (req, res) => {
    const { notation, fen } = req.body;
    const email = req.user.email;
    
    if (!notation) {
        return res.status(400).json({ error: 'Move notation is required' });
    }
    
    db.run('INSERT INTO chess_moves (gameId, notation, fen, player_email) VALUES (?, ?, ?, ?)',
        [req.params.gameId, notation, fen || null, email],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.get('SELECT id, notation, fen, created_at FROM chess_moves WHERE id = ?', [this.lastID], (err, row) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.status(201).json(row);
            });
        }
    );
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Auth server listening on 0.0.0.0:${PORT}`);
});
