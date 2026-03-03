'use client'

import React, { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from '@studio-freight/lenis'

export function ParallaxComponent() {
  const parallaxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    const triggerElement = parallaxRef.current?.querySelector('[data-parallax-layers]')
    if (triggerElement) {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: triggerElement,
          start: '0% 0%',
          end: '100% 0%',
          scrub: 0,
        },
      })

      const layers = [
        { layer: '1', yPercent: 70 },
        { layer: '2', yPercent: 55 },
        { layer: '3', yPercent: 40 },
        { layer: '4', yPercent: 10 },
      ]

      layers.forEach((layerObj, idx) => {
        tl.to(
          triggerElement.querySelectorAll(`[data-parallax-layer="${layerObj.layer}"]`),
          { yPercent: layerObj.yPercent, ease: 'none' },
          idx === 0 ? undefined : '<',
        )
      })
    }

    const lenis = new Lenis()
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000)
    })
    gsap.ticker.lagSmoothing(0)

    return () => {
      ScrollTrigger.getAll().forEach((st) => st.kill())
      if (triggerElement) {
        gsap.killTweensOf(triggerElement)
      }
      lenis.destroy()
    }
  }, [])

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#243053] bg-[#060912]" ref={parallaxRef}>
      <section className="relative min-h-[75vh]">
        <div className="absolute inset-0">
          <div data-parallax-layers className="relative h-full w-full">
            <img
              src="https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1400&auto=format&fit=crop"
              loading="eager"
              data-parallax-layer="1"
              alt="Arcade setup"
              className="absolute inset-0 h-full w-full object-cover opacity-40"
            />
            <img
              src="https://images.unsplash.com/photo-1560253023-3ec5d502959f?q=80&w=1400&auto=format&fit=crop"
              loading="eager"
              data-parallax-layer="2"
              alt="Neon hallway"
              className="absolute inset-0 h-full w-full object-cover opacity-50"
            />
            <div data-parallax-layer="3" className="absolute inset-0 flex items-center justify-center">
              <h2 className="text-4xl font-black uppercase tracking-[0.3em] text-white md:text-7xl">ZENCHI</h2>
            </div>
            <img
              src="https://images.unsplash.com/photo-1511882150382-421056c89033?q=80&w=1400&auto=format&fit=crop"
              loading="eager"
              data-parallax-layer="4"
              alt="Controller"
              className="absolute inset-0 h-full w-full object-cover opacity-55 mix-blend-screen"
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#060912] to-transparent" />
        </div>
      </section>
    </div>
  )
}
