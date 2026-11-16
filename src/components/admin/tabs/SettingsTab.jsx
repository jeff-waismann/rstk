import React, { useState, useEffect } from 'react';
import ImageField from '../ImageField.jsx';
import { apiService } from '../../../services/api.js';

export default function SettingsTab({ settings, onSaved, onNotify }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setForm({ ...settings });
  }, [settings]);

  if (!form) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiService.saveContent('settings', form);
      if (res.success) {
        onNotify?.('Configurações de WhatsApp, Rodapé e SEO salvas!', 'success');
        await onSaved?.();
      } else {
        onNotify?.(res.error || 'Erro ao salvar.', 'error');
      }
    } catch (err) {
      onNotify?.('Erro de conexão: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-[#0F172A]">WhatsApp & Atendimento</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Número WhatsApp (com DDI 55 e DDD)
            </label>
            <input
              type="text"
              value={form.whatsappNumber || ''}
              onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value.replace(/\D/g, '') })}
              placeholder="553488293565"
              className="w-full text-sm font-mono border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Nome da Marca no Rodapé
            </label>
            <input
              type="text"
              value={form.brandName || ''}
              onChange={(e) => setForm({ ...form, brandName: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
            Mensagem Padrão do WhatsApp (quando nenhum disco está selecionado)
          </label>
          <textarea
            rows="3"
            value={form.whatsappDefaultMessage || ''}
            onChange={(e) => setForm({ ...form, whatsappDefaultMessage: e.target.value })}
            className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
            Aviso Legal no Modal de Detalhes do Disco
          </label>
          <textarea
            rows="2"
            value={form.detailNote || ''}
            onChange={(e) => setForm({ ...form, detailNote: e.target.value })}
            className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-[#0F172A]">Rodapé & SEO</h3>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
            Texto Principal do Rodapé
          </label>
          <textarea
            rows="2"
            value={form.footerTextPrimary || ''}
            onChange={(e) => setForm({ ...form, footerTextPrimary: e.target.value })}
            className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
            Observação Legal do Rodapé
          </label>
          <textarea
            rows="2"
            value={form.footerTextSecondary || ''}
            onChange={(e) => setForm({ ...form, footerTextSecondary: e.target.value })}
            className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              Título SEO (&lt;title&gt;)
            </label>
            <input
              type="text"
              value={form.seoTitle || ''}
              onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
              URL Canônica do Site
            </label>
            <input
              type="url"
              value={form.siteUrl || ''}
              onChange={(e) => setForm({ ...form, siteUrl: e.target.value })}
              className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
            Meta Description
          </label>
          <textarea
            rows="2"
            value={form.seoDescription || ''}
            onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
            className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
          />
        </div>

        <ImageField
          label="Imagem de Compartilhamento (Open Graph)"
          value={form.ogImage || ''}
          onChange={(url) => setForm({ ...form, ogImage: url })}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider shadow-sm disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </form>
  );
}
