# React + shadcn Integration Guide

This repository currently runs a plain HTML/Canvas game (`index.html`) and does **not** include a React + TypeScript + Tailwind + shadcn setup.

## Current status
- React project structure: Not present
- TypeScript config (`tsconfig.json`): Not present
- Tailwind config (`tailwind.config.*`): Not present
- shadcn config (`components.json`): Not present

## Required setup (recommended)
Use a Next.js + TypeScript + Tailwind baseline, then initialize shadcn:

```bash
npx create-next-app@latest neon-react-ui --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd neon-react-ui
npx shadcn@latest init
npm install framer-motion lucide-react
```

## Default paths
- Components: `components/ui`
- Global styles (Next.js App Router): `src/app/globals.css` (or `app/globals.css` when not using `src/`)

If your project uses a different component folder, still create `components/ui`.
shadcn generators, team conventions, and import consistency typically rely on that path.

## Added component files in this repo
The following files were added exactly as requested:
- `components/ui/shape-landing-hero.tsx`
- `components/ui/demo.tsx`

These files are ready for a React + Tailwind + TypeScript app but are not executable in the current plain-HTML game runtime.

## Questions answered for this component
- What props are passed?
  - `HeroGeometric` accepts: `badge`, `title1`, `title2`.
- State management requirements?
  - None required; internal animation only.
- Required assets?
  - No external images required for this component.
- Responsive behavior?
  - Built-in via Tailwind responsive classes (`sm`, `md` breakpoints).
- Best placement in app?
  - Use on landing page hero section (`src/app/page.tsx` in Next.js).

## Integration note
This component imports `cn` from `@/lib/utils`.
When using shadcn init, this helper is typically generated automatically.