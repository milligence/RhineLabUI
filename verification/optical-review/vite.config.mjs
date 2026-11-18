import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
export default {
  root,
  publicDir: `${repo}/public`,
  cacheDir: `${root}/.cache`,
  server: {
    host: "127.0.0.1",
    port: Number(process.env.OPTICAL_REVIEW_PORT || 5184),
    strictPort: true,
    fs: { allow: [repo] },
  },
  resolve: {
    alias: {
      "@product": `${repo}/src`,
      three: `${repo}/node_modules/three/build/three.module.js`,
    },
  },
  optimizeDeps: { include: [], noDiscovery: true },
};
