# RSTK Atacado — Catálogo de Vinis (Astro + Cloudflare Pages + D1 + R2)

Projeto estruturado profissionalmente em **Astro**, **Cloudflare Pages Functions**, **Cloudflare D1 (SQLite)**, **Cloudflare R2 Storage** e painel administrativo **Agile Admin (React + Stitch Modern Blue)** a partir do catálogo standalone original (`legacy/RSTK_Catalogo_Novembro_2026.html`).

## Arquitetura do Projeto

```text
/
├── public/
│   ├── admin/index.html          # Shell HTML do painel administrativo Agile Admin
│   ├── assets/
│   │   ├── covers/               # 51 capas extraídas em arquivos otimizados (JPG/PNG/WEBP)
│   │   ├── css/catalog.css       # Folha de estilos modular (tema claro/escuro + responsivo)
│   │   ├── images/logo-rstk.png  # Logotipo oficial extraído
│   │   └── js/
│   │       ├── catalog.js        # Lógica de busca, filtros (com persistência em URL), modais e D1
│   │       └── admin-bundle.js   # Bundle React compilado do Agile Admin via esbuild
│   ├── _headers                  # Headers de segurança (CSP, HSTS, X-Frame-Options) e cache Edge
│   ├── _redirects                # Rewrite SPA para /admin/*
│   └── robots.txt
├── src/
│   ├── admin/admin-entry.jsx     # Entrada do painel administrativo (React)
│   ├── components/               # Componentes Astro (Header, Hero, CatalogSection, Footer, ModalsAndBars)
│   │   └── admin/                # MediaPickerModal, ImageField e abas (Dashboard, Catálogo, Hero, Settings, Media, Usuários)
│   ├── data/                     # Snapshot JSON (51 álbuns, configurações e manifesto de mídias)
│   ├── layouts/BaseLayout.astro  # HTML base com SEO, Open Graph, JSON-LD e preload de LCP
│   ├── pages/                    # index.astro (SSR/SSG dos 51 cards) e 404.astro
│   ├── services/                 # api.js e utilitários de moeda em centavos inteiros
│   └── utils/format.ts
├── functions/
│   ├── api/                      # Pages Functions conectadas ao D1 e R2
│   │   ├── auth/                 # Login (rate-limit + cookie HttpOnly), Logout, Me
│   │   ├── catalog/              # CRUD completo dos discos no D1
│   │   ├── content/[section].js  # Configurações do Hero, Oferta, WhatsApp e SEO
│   │   ├── media/                # Listagem, remoção e upload direto para R2 com sniffing MIME
│   │   └── users/                # Gestão de usuários Master/Admin com proteção contra auto-exclusão
│   └── uploads/[[path]].js       # Servindo mídias do R2 com cache imutável
├── server/auth.js                # Helpers compartilhados de sessão, hash e respostas JSON
├── scripts/
│   ├── build-admin.js            # Compila src/admin/admin-entry.jsx com esbuild
│   ├── extract-standalone.mjs    # Extrai base64 e dados do HTML legado
│   └── generate-seed.mjs         # Gera seed.sql a partir dos JSONs em src/data
├── schema.sql                    # Estrutura D1 (prefixo rstk_ em smartweb-db)
├── seed.sql                      # Carga inicial de 51 vinis, 52 mídias e configurações
└── wrangler.jsonc                # Configuração Cloudflare Pages, D1 (DB) e R2 (R2)
```

## Comandos Principais

```bash
# Instalar dependências
npm install

# Desenvolvimento local do Astro
npm run dev

# Build completo (Agile Admin + Astro)
npm run build

# Rodar localmente com Cloudflare Pages Functions + D1 + R2
npm run dev:local

# Aplicar schema e carga inicial no D1 remoto
npm run d1:remote

# Deploy para Cloudflare Pages
npm run deploy
```

## Acesso Administrativo

- URL do Painel: `/admin/`
- Usuário Master inicial semeado no D1 (`seed.sql`): `jeff@smartweb.com.br` (altere a senha na aba **Usuários** após o primeiro acesso).
