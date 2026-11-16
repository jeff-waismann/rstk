import React, { useState, useMemo } from 'react';
import ImageField from '../ImageField.jsx';
import { apiService } from '../../../services/api.js';
import { formatBRL, centsToInput, inputToCents } from '../../../services/currency.js';

const EMPTY_FORM = {
  id: null,
  artist: '',
  title: '',
  sourceTitle: '',
  units: 1,
  media: 'LP',
  date: new Date().toISOString().slice(0, 10),
  genre: 'Rock',
  cover: '',
  source: '',
  priceStr: '189,99',
  active: true,
  featuredHero: false
};

export default function CatalogTab({ products = [], defaultPriceCents = 18999, onReload, onNotify }) {
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const genres = useMemo(
    () => [...new Set(products.map((p) => p.genre))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchQuery =
        !q ||
        p.artist.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.genre.toLowerCase().includes(q);
      const matchGenre = !genreFilter || p.genre === genreFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && p.active) ||
        (statusFilter === 'inactive' && !p.active);
      return matchQuery && matchGenre && matchStatus;
    });
  }, [products, search, genreFilter, statusFilter]);

  function openNew() {
    setForm({
      ...EMPTY_FORM,
      priceStr: centsToInput(defaultPriceCents)
    });
    setModalOpen(true);
  }

  function openEdit(album) {
    setForm({
      id: album.id,
      artist: album.artist || '',
      title: album.title || '',
      sourceTitle: album.sourceTitle || '',
      units: Number(album.units) || 1,
      media: album.media || 'LP',
      date: album.date || new Date().toISOString().slice(0, 10),
      genre: album.genre || '',
      cover: album.cover || '',
      source: album.source || '',
      priceStr: centsToInput(album.priceCents ?? defaultPriceCents),
      active: Boolean(album.active),
      featuredHero: Boolean(album.featuredHero)
    });
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        id: form.id,
        artist: form.artist,
        title: form.title,
        sourceTitle: form.sourceTitle || form.title.toUpperCase(),
        units: Number(form.units) || 1,
        media: form.media || 'LP',
        date: form.date,
        genre: form.genre,
        cover: form.cover,
        source: form.source,
        priceCents: inputToCents(form.priceStr),
        active: form.active,
        featuredHero: form.featuredHero
      };

      const res = form.id
        ? await apiService.updateProduct(payload)
        : await apiService.createProduct(payload);

      if (res.success) {
        setModalOpen(false);
        onNotify?.(form.id ? 'Disco atualizado com sucesso!' : 'Novo disco adicionado ao catálogo!', 'success');
        await onReload?.();
      } else {
        onNotify?.(res.error || 'Erro ao salvar disco.', 'error');
      }
    } catch (err) {
      onNotify?.('Erro de conexão: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(album) {
    try {
      const res = await apiService.updateProduct({
        ...album,
        active: !album.active
      });
      if (res.success) {
        onNotify?.(
          !album.active ? `"${album.title}" publicado no catálogo.` : `"${album.title}" ocultado do catálogo.`,
          'success'
        );
        await onReload?.();
      }
    } catch (err) {
      onNotify?.('Erro ao alterar status: ' + err.message, 'error');
    }
  }

  async function handleDelete(album) {
    if (!confirm(`Remover permanentemente "${album.artist} — ${album.title}" do catálogo?`)) return;
    try {
      const res = await apiService.deleteProduct(album.id);
      if (res.success) {
        onNotify?.('Disco removido permanentemente.', 'success');
        await onReload?.();
      } else {
        onNotify?.(res.error || 'Erro ao remover disco.', 'error');
      }
    } catch (err) {
      onNotify?.('Erro de conexão: ' + err.message, 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar artista, álbum ou gênero..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
            />
          </div>

          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="text-sm bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
          >
            <option value="">Todos os gêneros</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
          >
            <option value="all">Todos ({products.length})</option>
            <option value="active">Ativos</option>
            <option value="inactive">Ocultos</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-xs"
        >
          <span className="material-symbols-outlined text-[18px] text-[#00C6F7]">add</span>
          <span>Novo Vinil</span>
        </button>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F7F9FB] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                <th className="py-3.5 px-4">Disco</th>
                <th className="py-3.5 px-4">Gênero</th>
                <th className="py-3.5 px-4">Formato</th>
                <th className="py-3.5 px-4">Data</th>
                <th className="py-3.5 px-4">Preço</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-[#64748B]">
                    Nenhum vinil encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filtered.map((album) => (
                  <tr key={album.id} className="hover:bg-[#F7F9FB]/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={album.cover}
                          alt={album.title}
                          className="w-12 h-12 rounded-lg object-cover border border-[#E2E8F0] flex-shrink-0"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-[#0F172A] truncate">{album.title}</p>
                          <p className="text-xs text-[#64748B] truncate">{album.artist}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-[#0F172A]">{album.genre}</td>
                    <td className="py-3 px-4 text-xs text-[#64748B]">
                      {album.units} {Number(album.units) === 1 ? 'LP' : 'LPs'}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#64748B] font-mono">{album.date}</td>
                    <td className="py-3 px-4 text-xs font-bold text-[#006782]">
                      {formatBRL(album.priceCents ?? defaultPriceCents)}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(album)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          album.active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-[#64748B] border border-slate-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            album.active ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        {album.active ? 'Ativo' : 'Oculto'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(album)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 rounded-lg mr-1"
                        title="Editar"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(album)}
                        className="inline-flex items-center p-1.5 text-[#F75656] hover:bg-red-50 rounded-lg"
                        title="Excluir permanentemente"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F7F9FB]">
              <h3 className="text-base font-bold text-[#0F172A]">
                {form.id ? `Editar Vinil #${form.id}` : 'Adicionar Novo Vinil'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-[#64748B] hover:text-[#0F172A]"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                    Artista *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.artist}
                    onChange={(e) => setForm({ ...form, artist: e.target.value })}
                    placeholder="Ex: Pearl Jam"
                    className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                    Título do Álbum *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Ex: Ten"
                    className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                    Gênero *
                  </label>
                  <input
                    type="text"
                    required
                    list="rstk-genres-list"
                    value={form.genre}
                    onChange={(e) => setForm({ ...form, genre: e.target.value })}
                    placeholder="Ex: Grunge"
                    className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
                  />
                  <datalist id="rstk-genres-list">
                    {genres.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                    Quantidade de LPs
                  </label>
                  <select
                    value={form.units}
                    onChange={(e) => setForm({ ...form, units: Number(e.target.value) })}
                    className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
                  >
                    <option value={1}>1 LP</option>
                    <option value={2}>2 LPs</option>
                    <option value={3}>3 LPs</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                    Preço (R$)
                  </label>
                  <input
                    type="text"
                    required
                    value={form.priceStr}
                    onChange={(e) => setForm({ ...form, priceStr: e.target.value })}
                    placeholder="189,99"
                    className="w-full text-sm font-mono border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                    Data da Edição
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                    Link de Referência da Capa
                  </label>
                  <input
                    type="url"
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    placeholder="https://music.apple.com/..."
                    className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00C6F7]"
                  />
                </div>
              </div>

              <ImageField
                label="Imagem da Capa *"
                value={form.cover}
                onChange={(url) => setForm({ ...form, cover: url })}
                helperText="Selecione da galeria ou faça upload de uma nova capa diretamente para o R2."
              />

              <div className="flex items-center gap-6 pt-2">
                <label className="inline-flex items-center gap-2 text-sm text-[#0F172A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="rounded border-slate-300 text-[#006782] focus:ring-[#00C6F7]"
                  />
                  <span>Exibir no catálogo público</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-[#E2E8F0] text-xs font-bold uppercase tracking-wider text-[#64748B] hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Disco'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
