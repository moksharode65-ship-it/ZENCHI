"use client"

import createGlobe, { type COBEOptions } from "cobe"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type GlobePreset = "earth" | "red" | "blue" | "mixed"

const BASE_CONFIG: COBEOptions = {
  width: 800,
  height: 800,
  onRender: () => {},
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.3,
  dark: 1,
  diffuse: 1.1,
  mapSamples: 16000,
  mapBrightness: 0.95,
  baseColor: [28 / 255, 7 / 255, 16 / 255],
  markerColor: [1, 70 / 255, 90 / 255],
  glowColor: [120 / 255, 28 / 255, 44 / 255],
  markers: [
    { location: [14.5995, 120.9842], size: 0.03 },
    { location: [19.076, 72.8777], size: 0.1 },
    { location: [23.8103, 90.4125], size: 0.05 },
    { location: [30.0444, 31.2357], size: 0.07 },
    { location: [39.9042, 116.4074], size: 0.08 },
    { location: [-23.5505, -46.6333], size: 0.1 },
    { location: [19.4326, -99.1332], size: 0.1 },
    { location: [40.7128, -74.006], size: 0.1 },
    { location: [34.6937, 135.5022], size: 0.05 },
    { location: [41.0082, 28.9784], size: 0.06 },
  ],
}

const PRESET_COLORS: Record<GlobePreset, Pick<COBEOptions, "baseColor" | "markerColor" | "glowColor">> = {
  earth: {
    baseColor: [42 / 255, 93 / 255, 138 / 255],
    markerColor: [118 / 255, 196 / 255, 121 / 255],
    glowColor: [120 / 255, 170 / 255, 220 / 255],
  },
  red: {
    baseColor: [28 / 255, 7 / 255, 16 / 255],
    markerColor: [1, 70 / 255, 90 / 255],
    glowColor: [120 / 255, 28 / 255, 44 / 255],
  },
  blue: {
    baseColor: [8 / 255, 20 / 255, 42 / 255],
    markerColor: [80 / 255, 170 / 255, 1],
    glowColor: [30 / 255, 70 / 255, 150 / 255],
  },
  mixed: {
    baseColor: [17 / 255, 10 / 255, 30 / 255],
    markerColor: [1, 105 / 255, 140 / 255],
    glowColor: [105 / 255, 40 / 255, 110 / 255],
  },
}

export function Globe({
  className,
  preset = "earth",
  config,
}: {
  className?: string
  preset?: GlobePreset
  config?: COBEOptions
}) {
  let phi = 0
  let width = 0
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerInteracting = useRef<number | null>(null)
  const pointerInteractionMovement = useRef(0)
  const [r, setR] = useState(0)

  const mergedConfig = useMemo<COBEOptions>(() => {
    return {
      ...BASE_CONFIG,
      ...PRESET_COLORS[preset],
      ...(config || {}),
    }
  }, [preset, config])

  const updatePointerInteraction = (value: number | null) => {
    pointerInteracting.current = value
    if (canvasRef.current) canvasRef.current.style.cursor = value ? "grabbing" : "grab"
  }

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current
      pointerInteractionMovement.current = delta
      setR(delta / 200)
    }
  }

  const onRender = useCallback(
    (state: Record<string, number>) => {
      if (!pointerInteracting.current) phi += 0.005
      state.phi = phi + r
      state.width = width * 2
      state.height = width * 2
    },
    [r],
  )

  const onResize = () => {
    if (canvasRef.current) width = canvasRef.current.offsetWidth
  }

  useEffect(() => {
    window.addEventListener("resize", onResize)
    onResize()

    const globe = createGlobe(canvasRef.current!, {
      ...mergedConfig,
      width: width * 2,
      height: width * 2,
      onRender,
    })

    setTimeout(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = "1"
    })

    return () => {
      globe.destroy()
      window.removeEventListener("resize", onResize)
    }
  }, [mergedConfig, onRender])

  return (
    <div className={cn("absolute inset-0 mx-auto aspect-[1/1] w-full max-w-[600px]", className)}>
      <canvas
        className={cn("size-full opacity-0 transition-opacity duration-500 [contain:layout_paint_size]")}
        ref={canvasRef}
        onPointerDown={(e) => updatePointerInteraction(e.clientX - pointerInteractionMovement.current)}
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onMouseMove={(e) => updateMovement(e.clientX)}
        onTouchMove={(e) => e.touches[0] && updateMovement(e.touches[0].clientX)}
      />
    </div>
  )
}
