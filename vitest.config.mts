import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json の paths("@/*": "./src/*")と対応させる。
  // src/repositories, src/types 等のクロスディレクトリ参照で "@/" エイリアスを使うため、
  // vitestの実行時解決にも同じエイリアスを設定する必要がある。
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
