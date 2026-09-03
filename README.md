# create-thanmatt-app

Scaffold a bare-bones Vite + React + TypeScript app with Tailwind v4 and shadcn/ui
already wired up. No prompts, no flags, no libraries you didn't ask for.

## Usage

```
pnpx create-thanmatt-app my-app
cd my-app
pnpm dev
```

## What you get

- **Vite + React 19 + TypeScript**, strict mode, from the official `react-ts` template
- **Tailwind v4** via `@tailwindcss/vite` — no `tailwind.config.ts`, just `@import "tailwindcss"`
- **shadcn/ui** preconfigured (`new-york`, `neutral`, CSS variables) with the theme tokens
  in `src/index.css` and `Button` already pulled in. Add more with
  `pnpm dlx shadcn@latest add <component>`.
- `@/*` path alias, wired for both TypeScript and Vite
- `components/`, `config/` and `features/` folders, each with a README describing what belongs in it

Deliberately **not** included: routing and state management. Add whatever the project
actually needs — TanStack Router, React Router, Zustand — rather than carrying a default
you have to rip out.

### Generated structure

```
src/
  components/
    README.md
    ui/button.tsx       # from shadcn
  config/
    README.md
  features/
    README.md
  lib/
    utils.ts            # shadcn's cn() helper
  App.tsx
  main.tsx
  index.css             # Tailwind + shadcn theme tokens
components.json
vite.config.ts
```

## Notes on a few deliberate choices

- **`pnpm create vite` is called without a `--` before `--template`.** With the `--`, pnpm
  swallows the flag and create-vite silently falls back to the vanilla-ts template.
- **No `baseUrl` in `tsconfig.app.json`.** TypeScript 6 rejects it outright with
  `TS5101: Option 'baseUrl' is deprecated`. `paths` alone resolves fine. The shadcn CLI *does*
  still need `baseUrl` (it resolves aliases with `tsconfig-paths`), so it goes in the root
  `tsconfig.json` instead — that file is a references-only solution file with `"files": []`,
  so `tsc -b` never type-checks it and the deprecation error never fires.
- **Theme tokens are written by this CLI, not by shadcn.** `shadcn add` only installs CSS
  variables as part of `init`, which is interactive. We write `components.json` directly and
  backfill the `neutral` tokens afterwards if they're missing.
- **A `pnpm-workspace.yaml` with an `allowBuilds` allowlist is written into the project.**
  pnpm 11 refuses to run dependency build scripts unless they are approved, and exits non-zero
  when it finds unapproved ones — which would otherwise require an interactive
  `pnpm approve-builds`.

## Developing this CLI

```
pnpm install
pnpm build       # tsup -> dist/index.js
pnpm typecheck
```

To try it without publishing:

```
node /path/to/create-thanmatt-app/dist/index.js my-app
```

## Publishing

```
npm login
pnpm build
npm publish --access public
```

Bump `version` in `package.json` first — npm will not let you republish a version that
already exists.
