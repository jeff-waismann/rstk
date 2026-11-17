import React from 'react';
import { formatBRL } from '../../../services/currency.js';

export default function DashboardTab({ products = [], settings = {}, onNavigate }) {
  const activeCount = products.filter((p) => p.active !== false).length;
  const totalStock = products.reduce((acc, p) => acc + (typeof p.stock === 'number' ? p.stock : 30), 0);
  const uniqueArtists = new Set(products.map((p) => p.artist)).size;
  const uniqueGenres = new Set(products.map((p) => p.genre)).size;
  const doubleLps = products.filter((p) => Number(p.units) >= 2).length;
  const featuredIds = Array.isArray(settings.heroFeaturedIds) ? settings.heroFeaturedIds : [7, 28, 24];
  const featuredAlbums = featuredIds
    .map((id) => products.find((p) => Number(p.id) === Number(id)))
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Vinis Ativos
            </span>
            <span className="w-9 h-9 rounded-lg bg-cyan-50 text-[#006782] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">album</span>
            </span>
          </div>
          <p className="text-3xl font-extrabold text-[#0F172A]">{activeCount}</p>
          <p className="text-xs text-[#64748B] mt-1">
            {totalStock} unidades em estoque ({doubleLps} álbuns duplos)
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Artistas & Gêneros
            </span>
            <span className="w-9 h-9 rounded-lg bg-slate-100 text-[#0F172A] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">library_music</span>
            </span>
          </div>
          <p className="text-3xl font-extrabold text-[#0F172A]">{uniqueArtists}</p>
          <p className="text-xs text-[#64748B] mt-1">{uniqueGenres} gêneros musicais no filtro</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Preço de Lançamento
            </span>
            <span className="w-9 h-9 rounded-lg bg-cyan-50 text-[#006782] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">sell</span>
            </span>
          </div>
          <p className="text-3xl font-extrabold text-[#006782]">
            {formatBRL(settings.priceCents ?? 18999)}
          </p>
          <p className="text-xs text-[#64748B] mt-1">
            Validade: {settings.validityDate || '30/11/2026'}
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              WhatsApp Atacado
            </span>
            <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">chat</span>
            </span>
          </div>
          <p className="text-lg font-bold text-[#0F172A] truncate">
            +{settings.whatsappNumber || '553488293565'}
          </p>
          <p className="text-xs text-[#64748B] mt-1">Atendimento direto com seleção</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">Atalhos de Gestão</h3>
              <p className="text-xs text-[#64748B]">
                As alterações salvas aqui atualizam o site em tempo real via Cloudflare D1 e R2.
              </p>
            </div>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#006782] hover:underline"
            >
              <span>Ver Catálogo Público</span>
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <button
              type="button"
              onClick={() => onNavigate('pedidos')}
              className="flex items-start gap-3 p-4 rounded-xl border border-[#00C6F7]/50 hover:border-[#00C6F7] bg-cyan-50/30 text-left transition-all"
            >
              <span className="material-symbols-outlined text-[#006782] text-[24px]">
                shopping_bag
              </span>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Pedidos WhatsApp</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Ver pedidos registrados pelo catálogo e histórico de baixas de estoque.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('catalogo')}
              className="flex items-start gap-3 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#00C6F7] bg-[#F7F9FB] text-left transition-all"
            >
              <span className="material-symbols-outlined text-[#006782] text-[24px]">
                add_circle
              </span>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Gerenciar Vinis</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Adicionar novos LPs, editar capas, datas e preços.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('hero')}
              className="flex items-start gap-3 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#00C6F7] bg-[#F7F9FB] text-left transition-all"
            >
              <span className="material-symbols-outlined text-[#006782] text-[24px]">
                campaign
              </span>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Oferta & Hero</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Atualizar preço único, validade, logo e discos flutuantes.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('media')}
              className="flex items-start gap-3 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#00C6F7] bg-[#F7F9FB] text-left transition-all"
            >
              <span className="material-symbols-outlined text-[#006782] text-[24px]">
                cloud_upload
              </span>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Biblioteca R2</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Subir novas capas direto no Cloudflare R2 Storage.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="flex items-start gap-3 p-4 rounded-xl border border-[#E2E8F0] hover:border-[#00C6F7] bg-[#F7F9FB] text-left transition-all"
            >
              <span className="material-symbols-outlined text-[#006782] text-[24px]">
                settings
              </span>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">WhatsApp & SEO</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Configurar número de atendimento, rodapé e meta tags.
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs">
          <h3 className="text-base font-bold text-[#0F172A] mb-1">Destaques no Hero</h3>
          <p className="text-xs text-[#64748B] mb-4">Capas flutuantes exibidas no topo do site.</p>
          <div className="space-y-3">
            {featuredAlbums.map((album) => (
              <div
                key={album.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-[#E2E8F0] bg-[#F7F9FB]"
              >
                <img
                  src={album.cover}
                  alt={album.title}
                  className="w-12 h-12 rounded object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#0F172A] truncate">{album.title}</p>
                  <p className="text-[11px] text-[#64748B] truncate">{album.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
