"use client";

import { useState, useEffect } from "react";
import { Trophy, Star, Flame, Coins, Target, Clock, Gamepad2, TrendingUp, Award, Gift, Zap } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string) || "http://localhost:8787";

interface DashboardData {
  credits: number;
  totalEarned: number;
  totalSpent: number;
  streakDays: number;
  lastLogin: string;
  totalPlaytimeMs: number;
  gamesPlayed: number;
  highScores: Record<string, number>;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  reward: number;
  earned: boolean;
}

interface LeaderboardEntry {
  rank: number;
  email: string;
  totalEarned: number;
  streak: number;
}

interface DashboardProps {
  authToken?: string;
  isAuthenticated?: boolean;
}

export default function ZenchiDashboard({ authToken = "", isAuthenticated = false }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const authHeaders = authToken ? ({ Authorization: `Bearer ${authToken}` } as Record<string, string>) : undefined;

  useEffect(() => {
    if (isAuthenticated && authToken) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, authToken]);

  const fetchDashboardData = async () => {
    try {
      const [dashRes, achRes, lbRes] = await Promise.all([
        fetch(`${API}/api/dashboard`, { credentials: "include", headers: authHeaders }),
        fetch(`${API}/api/achievements`, { credentials: "include", headers: authHeaders }),
        fetch(`${API}/api/leaderboard`, { credentials: "include", headers: authHeaders })
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        const today = new Date().toISOString().split("T")[0];
        setData({
          credits: dashData.credits || 0,
          totalEarned: dashData.totalEarned || 0,
          totalSpent: dashData.totalSpent || 0,
          streakDays: dashData.streakDays || 0,
          lastLogin: dashData.lastLogin || "",
          totalPlaytimeMs: dashData.totalPlaytimeMs || 0,
          gamesPlayed: dashData.gamesPlayed || 0,
          highScores: dashData.highScores || {}
        });
        if (dashData.lastLogin && dashData.lastLogin.startsWith(today)) {
          setDailyClaimed(true);
        }
      }
      if (achRes.ok) {
        const achData = await achRes.json();
        setAchievements(achData.map((a: any) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          reward: a.reward,
          earned: a.earned
        })));
      }
      if (lbRes.ok) setLeaderboard(await lbRes.json());
    } catch (err) {
      console.error("Error fetching dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const claimDailyBonus = async () => {
    if (dailyClaimed || claimingBonus) return;
    setClaimingBonus(true);

    try {
      const res = await fetch(`${API}/api/daily-bonus`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders ? { "Content-Type": "application/json", ...authHeaders } : { "Content-Type": "application/json" }
      });

      if (res.ok) {
        const result = await res.json();
        if (result.alreadyClaimed) {
          setData(prev => prev ? {
            ...prev,
            credits: result.credits ?? prev.credits,
            streakDays: result.streak ?? prev.streakDays
          } : null);
          setDailyClaimed(true);
          return;
        }
        setData(prev => prev ? {
          ...prev,
          credits: result.totalCredits ?? prev.credits,
          streakDays: result.newStreak ?? prev.streakDays,
          lastLogin: new Date().toISOString()
        } : null);
        setDailyClaimed(true);
      }
    } catch (err) {
      console.error("Error claiming bonus:", err);
    } finally {
      setClaimingBonus(false);
    }
  };

  const formatPlaytime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getTier = (credits: number) => {
    if (credits >= 10000) return { name: "Platinum", color: "from-gray-300 to-gray-500", icon: "P" };
    if (credits >= 5000) return { name: "Gold", color: "from-yellow-400 to-yellow-600", icon: "G" };
    if (credits >= 1000) return { name: "Silver", color: "from-gray-400 to-gray-600", icon: "S" };
    return { name: "Bronze", color: "from-amber-700 to-amber-900", icon: "B" };
  };

  if (loading) {
    return (
      <div className="glass rounded-3xl p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff233b]"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="glass rounded-3xl p-8 text-center min-h-[400px] flex flex-col items-center justify-center">
        <Gift size={48} className="text-[#ff233b] mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Login to Access Dashboard</h3>
        <p className="text-muted-foreground">Sign in to track your credits, achievements, and stats</p>
      </div>
    );
  }

  const tier = data ? getTier(data.credits) : { name: "Bronze", color: "from-amber-700 to-amber-900", icon: "B" };
  const earnedAchievements = achievements.filter(a => a.earned);

  return (
    <div className="space-y-6">
      {/* Header with Credits & Tier */}
      <div className="glass rounded-3xl p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${tier.color} flex items-center justify-center text-2xl`}>
              {tier.icon}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Your Tier</p>
              <h3 className="text-2xl font-bold text-white">{tier.name}</h3>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center">
                <Coins size={20} className="text-yellow-400" />
                <span className="text-3xl font-bold text-white">{data?.credits || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">Credits</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center">
                <Flame size={20} className="text-orange-500" />
                <span className="text-3xl font-bold text-white">{data?.streakDays || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">Day Streak</p>
            </div>
          </div>
        </div>

        {/* Daily Bonus Button */}
        <button
          onClick={claimDailyBonus}
          disabled={dailyClaimed || claimingBonus}
          className={`w-full mt-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
            dailyClaimed
              ? "bg-green-500/20 text-green-400 cursor-not-allowed"
              : "bg-gradient-to-r from-[#ff233b] to-[#ff6b6b] text-white hover:scale-[1.02]"
          }`}
        >
          {claimingBonus ? (
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
          ) : dailyClaimed ? (
            <>Daily Bonus Claimed</>
          ) : (
            <><Zap size={18} /> Claim Daily Bonus (+25 Credits)</>
          )}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass rounded-2xl p-4 text-center">
          <Clock size={24} className="mx-auto text-blue-400 mb-2" />
          <p className="text-2xl font-bold text-white">{formatPlaytime(data?.totalPlaytimeMs || 0)}</p>
          <p className="text-xs text-muted-foreground">Playtime</p>
        </div>
        
        <div className="glass rounded-2xl p-4 text-center">
          <Gamepad2 size={24} className="mx-auto text-purple-400 mb-2" />
          <p className="text-2xl font-bold text-white">{data?.gamesPlayed || 0}</p>
          <p className="text-xs text-muted-foreground">Games Played</p>
        </div>
        
        <div className="glass rounded-2xl p-4 text-center">
          <TrendingUp size={24} className="mx-auto text-green-400 mb-2" />
          <p className="text-2xl font-bold text-white">{data?.totalEarned || 0}</p>
          <p className="text-xs text-muted-foreground">Total Earned</p>
        </div>
        
        <div className="glass rounded-2xl p-4 text-center">
          <Award size={24} className="mx-auto text-yellow-400 mb-2" />
          <p className="text-2xl font-bold text-white">{earnedAchievements.length}/{achievements.length}</p>
          <p className="text-xs text-muted-foreground">Achievements</p>
        </div>
      </div>

      {/* Achievements */}
      <div className="glass rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={20} className="text-yellow-400" />
          <h3 className="text-lg font-bold text-white">Achievements</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {achievements.slice(0, 8).map((ach) => (
            <div
              key={ach.id}
              className={`p-3 rounded-xl border ${
                ach.earned
                  ? "bg-yellow-500/10 border-yellow-500/30"
                  : "bg-white/5 border-white/10 opacity-50"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Star size={14} className={ach.earned ? "text-yellow-400" : "text-gray-500"} />
                <span className="text-sm font-medium text-white">{ach.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{ach.description}</p>
              <p className="text-xs text-yellow-400 mt-1">+{ach.reward} CR</p>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="glass rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target size={20} className="text-[#ff233b]" />
          <h3 className="text-lg font-bold text-white">Leaderboard</h3>
        </div>
        
        <div className="space-y-2">
          {leaderboard.length > 0 ? (
            leaderboard.slice(0, 5).map((entry) => (
              <div
                key={entry.rank}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    entry.rank === 1 ? "bg-yellow-500 text-black" :
                    entry.rank === 2 ? "bg-gray-400 text-black" :
                    entry.rank === 3 ? "bg-amber-700 text-white" :
                    "bg-white/10 text-muted-foreground"
                  }`}>
                    {entry.rank}
                  </span>
                  <span className="text-white font-medium">{entry.email}</span>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{entry.totalEarned} CR</p>
                  <p className="text-xs text-muted-foreground">{entry.streak} days</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-center py-4">No players yet. Be the first!</p>
          )}
        </div>
      </div>

      {/* Credit Earning Info */}
      <div className="glass rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Coins size={20} className="text-green-400" />
          <h3 className="text-lg font-bold text-white">Earn Credits</h3>
        </div>
        
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="p-3 rounded-xl bg-white/5">
            <p className="text-white font-medium mb-1">Play Games</p>
            <p className="text-muted-foreground">+1 credit per minute</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <p className="text-white font-medium mb-1">Daily Login</p>
            <p className="text-muted-foreground">+25 credits daily</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <p className="text-white font-medium mb-1">High Scores</p>
            <p className="text-muted-foreground">+50-200 bonus credits</p>
          </div>
        </div>

        {/* Credit Packages */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-white mb-3">Buy Credits</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: "starter", name: "Starter", credits: 500, price: "$4.99" },
              { id: "basic", name: "Basic", credits: 1000, price: "$8.99" },
              { id: "pro", name: "Pro", credits: 2500, price: "$19.99" },
              { id: "elite", name: "Elite", credits: 5000, price: "$34.99" },
            ].map((pkg) => (
              <button
                key={pkg.id}
                onClick={async () => {
                  if (purchasingId) return;
                  setPurchasingId(pkg.id);
                  try {
                    const res = await fetch(`${API}/credits/purchase`, {
                      method: "POST",
                      credentials: "include",
                      headers: authHeaders
                        ? { "Content-Type": "application/json", ...authHeaders }
                        : { "Content-Type": "application/json" },
                      body: JSON.stringify({ packageId: pkg.id })
                    });
                    if (res.ok) {
                      const result = await res.json();
                      setData(prev => prev ? { ...prev, credits: result.balance ?? prev.credits } : prev);
                    }
                  } catch (err) {
                    console.error("Error purchasing credits:", err);
                  } finally {
                    setPurchasingId(null);
                  }
                }}
                disabled={!!purchasingId}
                className="p-3 rounded-xl border border-[#37406d] hover:border-[#ff233b] hover:bg-[#ff233b]/10 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <p className="text-white font-bold">{pkg.name}</p>
                <p className="text-yellow-400 text-sm">{pkg.credits} CR</p>
                <p className="text-muted-foreground text-xs">{pkg.price}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

