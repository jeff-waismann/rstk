import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://rstk-catalogo.pages.dev',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin')
    })
  ]
});
