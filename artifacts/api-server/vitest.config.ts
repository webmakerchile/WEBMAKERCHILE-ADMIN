import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Se ejecuta ANTES de los imports de cada archivo: varios módulos validan
    // sus credenciales al cargarse y sin esto el archivo entero ni arranca.
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 10000,
    pool: "forks",
  },
});
