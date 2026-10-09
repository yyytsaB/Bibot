import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist-verify",
    emptyOutDir: true,
    lib: {
      entry: "src/state/verify-bundle.ts",
      name: "VerifyStateBundle",
      formats: ["es"],
      fileName: () => "verify-bundle.js",
    },
  },
});
