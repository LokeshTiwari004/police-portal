import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      // Origin isolation: WebMCP requires an origin-keyed agent cluster.
      // Set to ?0 so same-origin contexts can register tools during local dev,
      // mirroring what the deployed (HTTPS) origin will do. Note: full WebMCP
      // functionality on localhost still requires the Chrome
      // chrome://flags/#enable-webmcp-testing flag.
      'Origin-Agent-Cluster': '?0',
    },
  },
})
