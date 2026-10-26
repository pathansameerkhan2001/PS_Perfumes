import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    // Content-hashed build files go to /static (cached for a year, see vercel.json), separate from
    // the un-hashed files in public/assets, which must stay revalidated
    assetsDir: 'static',
    cssCodeSplit: true,
    assetsInlineLimit: 4096, // Inline assets smaller than 4KB as base64 to avoid HTTP requests
    rolldownOptions: {
      output: {
        // Vendor chunks. A group also takes in the dependencies of what it matches, so React (the
        // highest priority) is captured first: with the former manualChunks function, React's JSX
        // runtime ended up in vendor-motion and every page downloaded the animation library
        // (only needed by the mobile menu and search) up front.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 40,
            },
            { name: 'vendor-supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/, priority: 30 },
            { name: 'vendor-icons', test: /[\\/]node_modules[\\/]lucide-react[\\/]/, priority: 20 },
            {
              name: 'vendor-motion',
              test: /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
