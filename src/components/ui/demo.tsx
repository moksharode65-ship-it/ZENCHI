import { FireBall } from "@/components/ui/fire-ball"
import { Globe } from "@/components/ui/globe"
import { TextScramble } from "@/components/ui/text-scramble"
import { GradientButton } from "@/components/ui/gradient-button"
import { WebGLShader } from "@/components/ui/web-gl-shader"
import { LiquidButton } from "@/components/ui/liquid-glass-button"

export default function DemoOne() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <FireBall />
      <h1 className="z-10 text-center text-7xl font-bold tracking-tighter">Fire Ball</h1>
    </div>
  )
}

export function GlobeDemo() {
  return (
    <div className="relative flex size-full max-w-lg items-center justify-center overflow-hidden rounded-lg border bg-background px-40 pb-40 pt-8 md:pb-60 md:shadow-xl">
      <span className="pointer-events-none whitespace-pre-wrap bg-gradient-to-b from-black to-gray-300/80 bg-clip-text text-center text-8xl font-semibold leading-none text-transparent dark:from-white dark:to-slate-900/10">
        Globe
      </span>
      <Globe className="top-28" />
      <div className="pointer-events-none absolute inset-0 h-full bg-[radial-gradient(circle_at_50%_200%,rgba(0,0,0,0.2),rgba(255,255,255,0))]" />
    </div>
  )
}

export function TextScrambleDemo() {
  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center gap-20 px-6">
      <div className="space-y-3 text-center">
        <p className="text-muted-foreground font-mono text-[10px] tracking-[0.4em] uppercase">Hover to decode</p>
      </div>
      <div className="flex flex-col items-center gap-12">
        <TextScramble text="VIEW WORK" />
      </div>
      <p className="text-muted-foreground font-mono text-xs tracking-wide">[ kinetic typography ]</p>
    </main>
  )
}

export function GradientButtonDemo() {
  return (
    <div className="flex gap-8">
      <GradientButton>Get Started</GradientButton>
      <GradientButton variant="variant">Get Started</GradientButton>
    </div>
  )
}

export function ShaderHeroDemo() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
      <WebGLShader />
      <div className="relative mx-auto w-full max-w-3xl border border-[#27272a] p-2">
        <main className="relative overflow-hidden border border-[#27272a] py-10">
          <h1 className="mb-3 text-center text-7xl font-extrabold tracking-tighter text-white md:text-[clamp(2rem,8vw,7rem)]">Design is Everything</h1>
          <p className="px-6 text-center text-xs text-white/60 md:text-sm lg:text-lg">
            Unleashing creativity through bold visuals, seamless interfaces, and limitless possibilities.
          </p>
          <div className="my-8 flex items-center justify-center gap-1">
            <span className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <p className="text-xs text-green-500">Available for New Projects</p>
          </div>
          <div className="flex justify-center">
            <LiquidButton className="rounded-full border text-white" size="xl">Let's Go</LiquidButton>
          </div>
        </main>
      </div>
    </div>
  )
}
