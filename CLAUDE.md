# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server with HMR
npm run build     # Type-check + production build
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
```

## Tech Stack

- **React 19** + **TypeScript 5.9** (strict mode)
- **Vite 7** with SWC plugin (not Babel — React Compiler is incompatible with SWC)
- **ESLint 9** flat config format

## Architecture

This is the early-stage scaffold for an antenna monitoring portal (Portal Monitoreo Antenas). The project uses the standard Vite React-TS template structure with `src/` as the source root and `index.html` as the HTML entry point.

As the application grows, organize source code under `src/` with subdirectories for `components/`, `pages/`, `services/` (API calls), and `hooks/` as needed.

## TypeScript Configuration

Two tsconfig files:
- `tsconfig.app.json` — app source code, targets ES2022, bundler module resolution
- `tsnet.node.json` — build tooling only (Vite config)

ESLint is configured with `react-hooks` and `react-refresh` plugins. To enable type-aware lint rules, update `eslint.config.js` to use `tseslint.configs.recommendedTypeChecked` and add `languageOptions.parserOptions` pointing to the tsconfig.
