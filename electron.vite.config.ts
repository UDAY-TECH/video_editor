import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __FFMPEG_DEV_PATH__: JSON.stringify(ffmpegPath),
      __FFPROBE_DEV_PATH__: JSON.stringify(ffprobeStatic.path),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    plugins: [react()],
  },
});
