import { FireBall } from "@/components/ui/fire-ball"
import { Globe } from "@/components/ui/globe"
import { TextScramble } from "@/components/ui/text-scramble"

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
