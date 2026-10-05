import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Both source trees must share the React instance used by the root renderer.
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    rolldownOptions: {
      input: { games: "index.html", batting: "superstaja/index.html", pitcher: "best-pitcher/index.html" },
    },
  },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
