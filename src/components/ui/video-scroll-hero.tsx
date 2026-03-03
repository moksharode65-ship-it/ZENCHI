"use client"

import React, { useRef, useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"

interface VideoScrollHeroProps {
  videoSrc?: string
  enableAnimations?: boolean
  className?: string
  startScale?: number
}

export function VideoScrollHero({
  videoSrc = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  enableAnimations = true,
  className = "",
  startScale = 0.25,
}: VideoScrollHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const [scrollScale, setScrollScale] = useState(startScale)

  useEffect(() => {
    if (!enableAnimations || shouldReduceMotion) return

    const handleScroll = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const containerHeight = containerRef.current.offsetHeight
      const windowHeight = window.innerHeight

      const scrolled = Math.max(0, -rect.top)
      const maxScroll = containerHeight - windowHeight
      const progress = Math.min(scrolled / maxScroll, 1)

      const newScale = startScale + progress * (1 - startScale)
      setScrollScale(newScale)
    }

    window.addEventListener("scroll", handleScroll)
    handleScroll()

    return () => window.removeEventListener("scroll", handleScroll)
  }, [enableAnimations, shouldReduceMotion, startScale])

  const shouldAnimate = enableAnimations && !shouldReduceMotion

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="relative h-[200vh] rounded-3xl bg-background">
        <div className="sticky top-0 z-10 flex h-screen w-full items-center justify-center">
          <div
            className="relative flex items-center justify-center will-change-transform"
            style={{
              transform: shouldAnimate ? `scale(${scrollScale})` : "scale(1)",
              transformOrigin: "center center",
            }}
          >
            <video autoPlay loop muted playsInline className="h-[60vh] w-[80vw] max-w-4xl rounded-2xl border border-[#2f3b62] object-cover shadow-2xl">
              <source src={videoSrc} type="video/mp4" />
              Your browser does not support the video tag.
            </video>

            <motion.div
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/30 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              <div className="text-center text-white">
                <motion.h1
                  className="mb-4 text-2xl font-bold md:text-4xl lg:text-6xl"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.8, type: "spring", stiffness: 200, damping: 25 }}
                >
                  Scroll to Scale
                </motion.h1>
                <motion.p
                  className="max-w-2xl px-4 text-sm text-white/80 md:text-lg lg:text-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0, duration: 0.8, type: "spring", stiffness: 200, damping: 25 }}
                >
                  Watch as the video expands with your scroll.
                </motion.p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
