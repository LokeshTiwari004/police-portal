import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // NOTE on WebMCP: the document must be origin-keyed for `document.modelContext`
  // to be available. We deliberately do NOT send `Origin-Agent-Cluster: ?0`,
  // because that header opts OUT of origin-keying (enables document.domain)
  // and therefore DISABLES WebMCP. The browser default keeps the document
  // origin-keyed. On localhost also enable chrome://flags/#enable-webmcp-testing;
  // prod HTTPS needs no flag.
})
