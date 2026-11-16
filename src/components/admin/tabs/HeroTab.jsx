import React, { useState, useEffect } from 'react';
import ImageField from '../ImageField.jsx';
import { apiService } from '../../../services/api.js';
import { centsToInput, inputToCents } from '../../../services/currency.js';

export default function HeroTab({ settings, products = [], onSaved, onNotify }) {
  const [form, setForm] = useState(null);
  const [priceInput, setPriceInput] = useState('189,99');
  const [applyToAll, setApplyToAll] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        ...settings,
        heroFeaturedIds: Array.isArray(settings.heroFeaturedIds)
          ? [...settings.heroFeaturedIds, '', '', ''].slice(0, 3)
          : [7, 28, 24]
      });
      setPriceInput(centsToInput(settings.priceCents ?? 18999));
    }
  }, [settings]);

  if (!form) return null;

  function updateFeatured(idx, value) {
    const next = [...form.heroFeaturedIds];
    next[idx] = Number(value) || '';
    setForm({ ...form, heroFeaturedIds: next });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const priceCents = inputToCents(priceInput);
      const payload = {
        ...form,
        priceCents,
        heroFeaturedIds: form.heroFeaturedIds.map((v) => Number(v)).filter((v) => v > 0),
        applyPriceToAllCatalog: applyToAll
      };
      const res = await apiService.saveContent('settings', payload);
      if (res.success) {
        onNotify?.('Hero e oferta de lançamento atualizados!', 'success');
        await onSaved?.();
      } else {
        onNotify?.(res.error || 'Erro ao salvar configurações.', 'error');
      }
    } catch (err) {
      onNotify?.('Erro de conexão: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const sortedProducts = [...products].sort((a, b) =>
    `${a.artist} - ${a.title}`.localeCompare(`${b.artist} - ${b.title}`, 'pt-BR')
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-5">
        <div>
          <h3 className="text-base font-bold text-[#0F172A]">Cabeçalho, Hero & Preço Único</h3>
          <p className="text-xs text-[#64748B]">
            Edite os textos principais da campanha e o preço exibido no destaque do catálogo.
          </p>
        </div>

        <ImageField
          label="Logo do Cabeçalho"
          value={form.logoUrl || ''}
          onChange={(url) => setForm({ ...form, logoUrl: url })}
          helperText="Recomendado PNG transparente; no tema escuro o filtro inverte automaticamente para branco."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Tagline do Topo
            </label>
            <input
              type="text"
              value={form.headerTagline || ''}
              onChange={(e) => setForm({ ...form, headerTagline: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Eyebrow da Campanha
            </label>
            <input
              type="text"
              value={form.heroEyebrow || ''}
              onChange={(e) => setForm({ ...form, heroEyebrow: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Título Principal (H1)
            </label>
            <input
              type="text"
              value={form.heroTitle || ''}
              onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Subtítulo de Destaque (Azul)
            </label>
            <input
              type="text"
              value={form.heroSubtitle || ''}
              onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-[#F7F9FB] border border-[#E2E8F0]">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Rótulo do Preço
            </label>
            <input
              type="text"
              value={form.launchLabel || ''}
              onChange={(e) => setForm({ ...form, launchLabel: e.target.value })}
              className="w-full text-sm bg-white border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Preço Único (R$)
            </label>
            <input
              type="text"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="189,99"
              className="w-full text-sm font-mono font-bold bg-white border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Data Limite da Oferta
            </label>
            <input
              type="text"
              value={form.validityDate || ''}
              onChange={(e) => setForm({ ...form, validityDate: e.target.value })}
              placeholder="30/11/2026"
              className="w-full text-sm bg-white border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
          <div className="md:col-span-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0F172A] cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="rounded border-slate-300 text-[#006782] focus:ring-[#00C6F7]"
              />
              <span>Atualizar este preço também em todos os discos individuais do catálogo</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Título da Seção de Catálogo
            </label>
            <input
              type="text"
              value={form.browseTitle || ''}
              onChange={(e) => setForm({ ...form, browseTitle: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Subtítulo da Seção de Catálogo
            </label>
            <input
              type="text"
              value={form.browseSubtitle || ''}
              onChange={(e) => setForm({ ...form, browseSubtitle: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-[#0F172A]">3 Capas Flutuantes do Hero</h3>
          <p className="text-xs text-[#64748B]">
            Escolha os 3 discos exibidos na animação lateral do topo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((idx) => (
            <div key={idx}>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                Capa #{idx + 1} {idx === 2 ? '(Centro / Destaque)' : ''}
              </label>
              <select
                value={form.heroFeaturedIds[idx] || ''}
                onChange={(e) => updateFeatured(idx, e.target.value)}
                className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
              >
                <option value="">Selecionar disco...</option>
                {sortedProducts.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.artist} — {album.title}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
            Legenda abaixo das capas
          </label>
          <input
            type="text"
            value={form.heroCaption || ''}
            onChange={(e) => setForm({ ...form, heroCaption: e.target.value })}
            className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider shadow-sm disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar Alterações do Hero'}
        </button>
      </div>
    </form>
  );
}
