/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    // ... Specify options here.
    environment: "node",
    testTimeout: 60000,
    passWithNoTests: true,
  }, 
  envPrefix: "THORDEX",
})
