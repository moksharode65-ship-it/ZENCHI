"use client";

import { useEffect, useRef, useState } from "react";
import { X, Maximize2, Minimize2, Pause, Play } from "lucide-react";

interface GameFrameProps {
  gamePath: string;
  title: string;
  onClose: () => void;
  isActive: boolean;
  authToken?: string;
  gameId?: string;
  onGameEnd?: (playtime: number, score: number) => void;
}

const API = "http://localhost:8787";

export function GameFrame({ gamePath, title, onClose, isActive, authToken = "", gameId = "game", onGameEnd }: GameFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const startTimeRef = useRef<number>(0);
  const playedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isActive && !isPaused && playedRef.current) {
      // Game was active, now closing - update stats
      const playtime = Date.now() - startTimeRef.current;
      if (authToken && playtime > 5000) {
        updateGameStats(playtime);
      }
    }
    
    if (isActive && !isPaused) {
      startTimeRef.current = Date.now();
      playedRef.current = true;
    }
    
    if (!isActive) {
      setIsPaused(true);
    } else {
      setIsPaused(false);
    }
  }, [isActive]);

  const updateGameStats = async (playtime: number, score: number = 0) => {
    try {
      const minutes = Math.floor(playtime / 60000);
      
      // Update stats
      await fetch(`${API}/api/stats`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          gameId,
          playtimeMs: playtime,
          score
        })
      });

      // Add playtime credits (1 credit per minute)
      if (minutes > 0) {
        await fetch(`${API}/api/playtime`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            minutes,
            score
          })
        });
      }
    } catch (err) {
      console.error("Error updating game stats:", err);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div
      className={`relative bg-black rounded-xl overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-50" : "w-full h-[600px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a1124] border-b border-[#2f375f]">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 rounded-lg hover:bg-[#1a2340] transition-colors"
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-[#1a2340] transition-colors"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Game Frame */}
      <iframe
        ref={iframeRef}
        src={gamePath}
        className="w-full h-[calc(100%-44px)] border-0"
        allow="autoplay; fullscreen"
        title={title}
      />

      {/* Overlay when paused */}
      {isPaused && isActive && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
          <div className="text-center">
            <p className="text-white text-lg mb-2">Game Paused</p>
            <button
              onClick={() => setIsPaused(false)}
              className="px-4 py-2 bg-[#ff233b] text-white rounded-lg hover:bg-[#ff4455] transition-colors"
            >
              Resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
