import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Só ativa o proxy em desenvolvimento quando VITE_API_URL não está definido
        ...(!env.VITE_API_URL && {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
        }),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
