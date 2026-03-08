# React + TypeScript + Vite

## Cloudflare Pages deployment

This app is configured for SPA hosting on Cloudflare Pages:

- Build command: `pnpm build`
- Output directory: `dist`
- Required env var: `VITE_API_BASE_URL`
- Optional signed upload env vars:
  - `VITE_DOCUMENT_USE_SIGNED_UPLOAD=true`
  - `VITE_DOCUMENT_SIGNED_UPLOAD_FALLBACK=true` (only if you want multipart fallback)

Routing fallback is configured via `public/_redirects`:

```
/* /index.html 200
```

A basic `wrangler.toml` is included with `pages_build_output_dir = "dist"`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

```
daasom-web
├─ .env
├─ .vite
│  └─ deps
│     ├─ _metadata.json
│     └─ package.json
├─ README.md
├─ eslint.config.js
├─ index.html
├─ package.json
├─ pnpm-lock.yaml
├─ postcss.config.js
├─ public
│  └─ vite.svg
├─ src
│  ├─ App.css
│  ├─ App.tsx
│  ├─ api
│  │  ├─ clients.ts
│  │  └─ http.ts
│  ├─ assets
│  │  └─ react.svg
│  ├─ auth
│  │  └─ authApi.ts
│  ├─ components
│  │  └─ Nav.tsx
│  ├─ index.css
│  ├─ main.tsx
│  ├─ pages
│  │  ├─ AppShell.tsx
│  │  ├─ ClientsPage.tsx
│  │  └─ LoginPage.tsx
│  ├─ routes
│  │  └─ ProtectedRoute.tsx
│  └─ state
│     └─ auth.tsx
├─ tailwind.config.js
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts

```
```
daasom-web
├─ .env
├─ .vite
│  └─ deps
│     ├─ _metadata.json
│     └─ package.json
├─ README.md
├─ eslint.config.js
├─ index.html
├─ package.json
├─ pnpm-lock.yaml
├─ postcss.config.js
├─ public
│  └─ vite.svg
├─ src
│  ├─ App.css
│  ├─ App.tsx
│  ├─ api
│  │  ├─ clients.ts
│  │  └─ http.ts
│  ├─ assets
│  │  └─ react.svg
│  ├─ auth
│  │  └─ authApi.ts
│  ├─ components
│  │  └─ Nav.tsx
│  ├─ index.css
│  ├─ main.tsx
│  ├─ pages
│  │  ├─ AppShell.tsx
│  │  ├─ ClientsPage.tsx
│  │  └─ LoginPage.tsx
│  ├─ routes
│  │  └─ ProtectedRoute.tsx
│  └─ state
│     └─ auth.tsx
├─ tailwind.config.js
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts

```
```
daasom-web
├─ .env
├─ .vite
│  └─ deps
│     ├─ _metadata.json
│     └─ package.json
├─ README.md
├─ eslint.config.js
├─ index.html
├─ package.json
├─ pnpm-lock.yaml
├─ postcss.config.js
├─ public
│  └─ vite.svg
├─ src
│  ├─ App.css
│  ├─ App.tsx
│  ├─ api
│  │  ├─ clients.ts
│  │  └─ http.ts
│  ├─ assets
│  │  └─ react.svg
│  ├─ auth
│  │  └─ authApi.ts
│  ├─ components
│  │  └─ Nav.tsx
│  ├─ index.css
│  ├─ main.tsx
│  ├─ pages
│  │  ├─ AppShell.tsx
│  │  ├─ ClientsPage.tsx
│  │  └─ LoginPage.tsx
│  ├─ routes
│  │  └─ ProtectedRoute.tsx
│  └─ state
│     └─ auth.tsx
├─ tailwind.config.js
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts

```
```
daasom-web
├─ .env
├─ .vite
│  └─ deps
│     ├─ _metadata.json
│     └─ package.json
├─ README.md
├─ eslint.config.js
├─ index.html
├─ package.json
├─ pnpm-lock.yaml
├─ postcss.config.js
├─ public
│  └─ vite.svg
├─ src
│  ├─ App.css
│  ├─ App.tsx
│  ├─ api
│  │  ├─ clients.ts
│  │  └─ http.ts
│  ├─ assets
│  │  └─ react.svg
│  ├─ auth
│  │  └─ authApi.ts
│  ├─ components
│  │  └─ Nav.tsx
│  ├─ index.css
│  ├─ main.tsx
│  ├─ pages
│  │  ├─ AppShell.tsx
│  │  ├─ ClientsPage.tsx
│  │  └─ LoginPage.tsx
│  ├─ routes
│  │  └─ ProtectedRoute.tsx
│  └─ state
│     └─ auth.tsx
├─ tailwind.config.js
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts

```