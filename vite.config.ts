// vite.config.js
import { resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

import pkg from './package.json'

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
      pathsToAliases: false,
    })
  ],
  build: {
    minify: false,
    outDir: 'lib',
    target: 'es2017',
    commonjsOptions: {
        include: [/node_modules/],
        esmExternals: true,
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, './src'),
      name: 'index',
      fileName: 'index',
      formats: ['cjs', "umd"]
    },
    rollupOptions: {
      onwarn: (warning) => {
        // Ignore circular dependency warnings
        if (warning.code === 'CIRCULAR_DEPENDENCY') return
      },
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      input: resolve(__dirname, './src'),
      output: {
        exports: 'named',
      },
      external: Object.keys(pkg.dependencies || {}),
    },
  },

})
