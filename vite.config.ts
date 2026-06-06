/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  resolve: mode === "test" ? { conditions: ["browser"] } : undefined,
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
    chunkSizeWarningLimit: 2000,
  },
  base: "./",
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "logseq-environments/**"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts", "src/**/*.svelte"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    },
    deps: {
      optimizer: {
        web: {
          include: ["@logseq/libs"],
        },
      },
    },
  },
}));
