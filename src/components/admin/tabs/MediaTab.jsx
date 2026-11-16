import React, { useState, useEffect } from 'react';
import { apiService } from '../../../services/api.js';

export default function MediaTab({ onNotify }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadMedia();
  }, []);

  async function loadMedia(query = search) {
    setLoading(true);
    try {
      const res = await apiService.getMediaList({ search: query });
      if (res.success) {
        setItems(res.items || []);
      }
    } catch (err) {
      onNotify?.('Erro ao listar mídias: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const res = await apiService.uploadFile(file);
        if (!res.success) {
          onNotify?.(res.error || `Falha no envio de ${file.name}`, 'error');
        }
      }
      onNotify?.('Upload para Cloudflare R2 concluído!', 'success');
      await loadMedia();
    } catch (err) {
      onNotify?.('Erro no upload: ' + err.message, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Excluir "${item.filename}" permanentemente do banco e do R2?`)) return;
    try {
      const res = await apiService.deleteMedia(item.id);
      if (res.success) {
        onNotify?.('Mídia removida.', 'success');
        setItems((prev) => prev.filter((m) => m.id !== item.id));
      } else {
        onNotify?.(res.error || 'Erro ao excluir mídia.', 'error');
      }
    } catch (err) {
      onNotify?.('Erro: ' + err.message, 'error');
    }
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      onNotify?.(`URL copiada: ${url}`, 'success');
    } catch {
      onNotify?.(url, 'success');
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              loadMedia(e.target.value);
            }}
            placeholder="Buscar arquivos no R2..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
          />
        </div>

        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider">
          <span className="material-symbols-outlined text-[18px] text-[#00C6F7]">cloud_upload</span>
          <span>{uploading ? 'Enviando...' : 'Upload para R2'}</span>
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {loading ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center text-[#64748B]">
          Carregando biblioteca...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs flex flex-col"
            >
              <div className="aspect-square bg-slate-100 overflow-hidden">
                <img
                  src={item.url}
                  alt={item.filename}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#0F172A] truncate" title={item.filename}>
                    {item.filename}
                  </p>
                  <p className="text-[10px] text-[#64748B]">
                    {Math.round((item.size_bytes || 0) / 1024)} KB
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => copyUrl(item.url)}
                    className="text-[11px] font-bold text-[#006782] hover:underline"
                  >
                    Copiar URL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="text-[#F75656] hover:bg-red-50 p-1 rounded"
                    title="Remover"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
