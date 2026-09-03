#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { execa } from "execa";
import pc from "picocolors";

// :: Runtime dependencies installed into the generated project. Tailwind plus what
// :: shadcn/ui needs, and nothing else -- state and routing stay a per-project choice.
const RUNTIME_DEPS = [
  "tailwindcss",
  "@tailwindcss/vite",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "lucide-react",
];

// :: pnpm 11 refuses to run dependency build scripts unless they are allowlisted,
// :: and exits non-zero when it finds unapproved ones. Ship the allowlist so the
// :: generated project installs without an interactive `pnpm approve-builds`.
const PNPM_WORKSPACE = `allowBuilds:
  esbuild: true
  "@tailwindcss/oxide": true
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
`;

const INDEX_CSS = `@import "tailwindcss";
`;

const APP_TSX = `import { Button } from "@/components/ui/button";

function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">It works</h1>
      <Button>Button</Button>
    </main>
  );
}

export default App;
`;

const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

// :: "config": "" is correct for Tailwind v4 -- there is no tailwind.config.ts anymore
const COMPONENTS_JSON = `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
`;

const LIB_UTILS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// :: Merge conditional class names and resolve Tailwind conflicts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

const COMPONENTS_README = `# components

Shared, project-level components — anything used by more than one feature.

shadcn/ui components install into \`ui/\`. Add more with:

\`\`\`
pnpm dlx shadcn@latest add <component>
\`\`\`

If a component is only ever used by a single feature, it belongs in that feature's
own \`components/\` folder instead.
`;

const FEATURES_README = `# features

One folder per feature, each self-contained. A feature owns its own components,
hooks, utils, types and data access, and exports only what the rest of the app needs.

\`\`\`
features/
  billing/
    components/
    hooks/
    utils/
    api.ts
    types.ts
\`\`\`

Nothing here is prescriptive — add only the folders a feature actually uses. Once
something is needed by two features, move it up to \`src/components/\` or \`src/lib/\`.
`;

const CONFIG_README = `# config

App-wide configuration and the clients that talk to the outside world — API client,
env var access, third-party SDK setup.

Read environment variables here rather than scattering \`import.meta.env\` through the
app, so there is one place to see what the project depends on:

\`\`\`ts
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
\`\`\`

Only truly global setup belongs here. Anything a single feature owns stays in that
feature's folder.
`;

// :: shadcn "neutral" theme tokens, written only if the shadcn CLI did not add them itself
const SHADCN_THEME = `
@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.269 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.371 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
}

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;

// :: Run a child process, streaming its output straight through to the terminal
async function run(command: string, args: string[], cwd: string) {
  await execa(command, args, { cwd, stdio: "inherit" });
}

// :: Write a file, creating any missing parent directories first
async function write(root: string, relativePath: string, contents: string) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

// :: Remove a file if it is there, ignoring the case where it is not
async function removeIfPresent(root: string, relativePath: string) {
  const target = path.join(root, relativePath);
  if (existsSync(target)) {
    await unlink(target);
  }
}

function step(message: string) {
  console.log(pc.cyan(`\n:: ${message}`));
}

// :: Insert a paths-only alias into whichever tsconfig the Vite template shipped.
// :: Done as plain text because these files carry // comments that a JSON round-trip
// :: would throw on or silently drop. No baseUrl -- it is deprecated and TypeScript
// :: rejects it outright with TS5101 in any project it actually type-checks.
async function addPathAlias(root: string) {
  const candidates = ["tsconfig.app.json", "tsconfig.json"];
  const fileName = candidates.find((name) => existsSync(path.join(root, name)));

  if (!fileName) {
    throw new Error("Could not find tsconfig.app.json or tsconfig.json");
  }

  const target = path.join(root, fileName);
  const source = await readFile(target, "utf8");

  if (source.includes('"@/*"')) {
    return fileName;
  }

  const marker = '"compilerOptions": {';
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(`No "compilerOptions" block found in ${fileName}`);
  }

  const insertAt = markerIndex + marker.length;
  const alias = '\n    "paths": {\n      "@/*": ["./src/*"]\n    },';

  await writeFile(
    target,
    source.slice(0, insertAt) + alias + source.slice(insertAt),
    "utf8",
  );

  return fileName;
}

// :: The shadcn CLI resolves the @/ aliases with tsconfig-paths, which unlike
// :: TypeScript itself still requires baseUrl -- without it shadcn writes components
// :: into a literal "@" directory instead of src/. The split template layout gives us
// :: somewhere safe to put it: the root tsconfig.json carries "files": [] and only
// :: project references, so tsc -b never type-checks it and TS5101 never fires.
async function addResolverAlias(root: string) {
  const rootConfigPath = path.join(root, "tsconfig.json");

  // :: Only safe on the split layout. On a single-tsconfig template that file is
  // :: compiled, and baseUrl there would break the build.
  if (!existsSync(path.join(root, "tsconfig.app.json"))) {
    return false;
  }

  const source = await readFile(rootConfigPath, "utf8");

  if (source.includes('"baseUrl"')) {
    return false;
  }

  const trimmed = source.trimEnd();
  const lastBrace = trimmed.lastIndexOf("}");

  if (lastBrace === -1) {
    throw new Error("Could not parse tsconfig.json");
  }

  const head = trimmed.slice(0, lastBrace).trimEnd();
  const separator = head.endsWith(",") ? "" : ",";
  const block =
    separator +
    '\n  "compilerOptions": {' +
    '\n    "baseUrl": ".",' +
    '\n    "paths": {' +
    '\n      "@/*": ["./src/*"]' +
    "\n    }" +
    "\n  }\n}\n";

  await writeFile(rootConfigPath, head + block, "utf8");
  return true;
}

// :: The shadcn CLI only adds theme tokens when it initialises a project. We write
// :: components.json ourselves to stay non-interactive, so backfill the tokens if
// :: `shadcn add` left the stylesheet without them.
async function ensureThemeTokens(root: string) {
  const cssPath = path.join(root, "src", "index.css");
  const css = await readFile(cssPath, "utf8");

  if (css.includes("--primary")) {
    return false;
  }

  await writeFile(cssPath, css.trimEnd() + "\n" + SHADCN_THEME, "utf8");
  return true;
}

async function scaffold(projectName: string) {
  const cwd = process.cwd();
  const root = path.resolve(cwd, projectName);

  if (existsSync(root)) {
    throw new Error(`Directory "${projectName}" already exists`);
  }

  // :: 1. Base app. No `--` before `--template`: pnpm swallows it and create-vite
  // :: silently falls back to the vanilla-ts template.
  step(`Creating Vite React + TypeScript app in ${projectName}/`);
  await run("pnpm", ["create", "vite@latest", projectName, "--template", "react-ts"], cwd);

  // :: 2. Dependencies, in one batched install
  step("Installing dependencies");
  await write(root, "pnpm-workspace.yaml", PNPM_WORKSPACE);
  await run("pnpm", ["install"], root);
  await run("pnpm", ["add", ...RUNTIME_DEPS], root);

  // :: 3. Tailwind v4, and a clean entry point in place of the template's demo
  step("Wiring up Tailwind v4");
  await write(root, "vite.config.ts", VITE_CONFIG);
  await write(root, "src/index.css", INDEX_CSS);
  await write(root, "src/App.tsx", APP_TSX);
  await write(root, "src/main.tsx", MAIN_TSX);
  await removeIfPresent(root, "src/App.css");
  await rm(path.join(root, "src", "assets"), { recursive: true, force: true });

  // :: 4. Path alias so the @/ imports shadcn generates resolve
  step("Adding the @/* path alias");
  const tsconfigName = await addPathAlias(root);
  console.log(pc.dim(`   patched ${tsconfigName}`));

  if (await addResolverAlias(root)) {
    console.log(pc.dim("   patched tsconfig.json for the shadcn resolver"));
  }

  // :: 5. shadcn/ui. Writing components.json by hand avoids the interactive `shadcn init`.
  step("Setting up shadcn/ui");
  await write(root, "components.json", COMPONENTS_JSON);
  await write(root, "src/lib/utils.ts", LIB_UTILS);
  await run("pnpm", ["dlx", "shadcn@latest", "add", "button", "-y"], root);

  if (await ensureThemeTokens(root)) {
    console.log(pc.dim("   added shadcn theme tokens to src/index.css"));
  }

  // :: 6. Project structure. Each folder carries a README explaining what belongs in
  // :: it, which also keeps the otherwise-empty directory tracked by git.
  step("Creating the project structure");
  await write(root, "src/components/README.md", COMPONENTS_README);
  await write(root, "src/config/README.md", CONFIG_README);
  await write(root, "src/features/README.md", FEATURES_README);

  console.log(pc.green(`\nDone. ${projectName} is ready.`));
  console.log(`\n  ${pc.bold(`cd ${projectName}`)}`);
  console.log(`  ${pc.bold("pnpm dev")}\n`);
}

const program = new Command();

program
  .name("create-thanmatt-app")
  .description(
    "Scaffold a bare-bones Vite + React + TypeScript app with Tailwind v4 and shadcn/ui",
  )
  .argument("<project-name>", "directory to create the app in")
  .action(async (projectName: string) => {
    try {
      await scaffold(projectName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`\ncreate-thanmatt-app failed: ${message}`));
      process.exit(1);
    }
  });

program.parse();
