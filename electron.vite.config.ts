import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const wp14Benchmark = mode === 'wp14-bench'

  return {
    main: {
      plugins: [externalizeDepsPlugin()]
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: wp14Benchmark
        ? {
            rollupOptions: {
              input: {
                index: resolve('src/preload/index.ts'),
                wp14Benchmark: resolve('src/preload/wp14Benchmark.ts')
              }
            }
          }
        : undefined
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react()],
      build: wp14Benchmark
        ? {
            rollupOptions: {
              input: {
                index: resolve('src/renderer/index.html'),
                'wp14-bench': resolve('src/renderer/wp14-bench.html'),
                'wp14-hydrate': resolve('src/renderer/wp14-hydrate.html')
              }
            }
          }
        : undefined
    }
  }
})
