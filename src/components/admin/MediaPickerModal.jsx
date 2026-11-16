import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api.js';

export function formatMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
    return url;
  }
  return '/' + url;
}

export default function MediaPickerModal({ isOpen, onClose, onSelect, currentUrl = '' }) {
  const [activeTab, setActiveTab] = useState('library');
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMedia();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      loadMedia();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, filterType]);

  async function loadMedia() {
    setLoading(true);
    try {
      const res = await apiService.getMediaList({
        search,
        mimeType: filterType === 'all' ? '' : filterType
      });
      if (res.success) {
        const items = res.items || [];
        setMediaList(items);
        if (currentUrl) {
          const match = items.find(
            (item) => item.url === currentUrl || currentUrl.endsWith(item.filename)
          );
          if (match) setSelectedItem(match);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar mídias:', err);
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadStatus(`Enviando ${file.name} para Cloudflare R2...`);
    try {
      const res = await apiService.uploadFile(file);
      if (res.success && res.file) {
        setMediaList((prev) => [res.file, ...prev]);
        setSelectedItem(res.file);
        setActiveTab('library');
        setUploadStatus('');
      } else {
        setUploadStatus(res.error || 'Falha ao enviar arquivo.');
      }
    } catch (err) {
      setUploadStatus('Erro de conexão: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  }

  function handleConfirm() {
    if (selectedItem) {
      onSelect(formatMediaUrl(selectedItem.url));
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-[#E2E8F0]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F7F9FB]">
          <div>
            <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#00C6F7]">photo_library</span>
              Biblioteca de Mídias (Cloudflare R2)
            </h3>
            <p className="text-xs text-[#64748B]">
              Escolha uma capa ou faça upload de uma nova imagem diretamente para o R2.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#64748B] hover:text-[#0F172A] p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
            aria-label="Fechar biblioteca"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 border-b border-[#E2E8F0] bg-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                activeTab === 'library'
                  ? 'bg-[#0F172A] text-white'
                  : 'text-[#64748B] hover:bg-slate-100'
              }`}
            >
              Galeria ({mediaList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                activeTab === 'upload'
                  ? 'bg-[#0F172A] text-white'
                  : 'text-[#64748B] hover:bg-slate-100'
              }`}
            >
              Upload R2
            </button>
          </div>

          {activeTab === 'library' && (
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="Buscar por nome do arquivo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
                />
                <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-[16px]">
                  search
                </span>
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 text-xs bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
              >
                <option value="all">Todos</option>
                <option value="image">Imagens</option>
                <option value="application/pdf">PDF</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 p-6 overflow-y-auto bg-[#F7F9FB]">
            {activeTab === 'upload' ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`h-full flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-12 text-center bg-white transition-colors ${
                  dragActive ? 'border-[#00C6F7] bg-cyan-50/40' : 'border-slate-300'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-cyan-50 text-[#006782] flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[36px]">cloud_upload</span>
                </div>
                <h4 className="text-base font-bold text-[#0F172A] mb-1">
                  Arraste uma capa ou selecione do computador
                </h4>
                <p className="text-xs text-[#64748B] max-w-md mb-6">
                  Envio direto para o Cloudflare R2 (JPG, PNG, WEBP, SVG ou PDF até 20MB).
                </p>
                <label className="cursor-pointer inline-flex items-center gap-2 bg-[#0F172A] hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition-all">
                  <span className="material-symbols-outlined text-[18px] text-[#00C6F7]">
                    add_photo_alternate
                  </span>
                  <span>Selecionar Arquivo</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => uploadFile(e.target.files?.[0])}
                    accept="image/*,.pdf"
                    disabled={uploading}
                  />
                </label>
                {uploadStatus && (
                  <p className="mt-4 text-xs font-semibold text-[#006782]">{uploadStatus}</p>
                )}
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-24 text-[#64748B]">
                <span className="material-symbols-outlined animate-spin text-[32px] mr-2">sync</span>
                <span className="text-sm font-medium">Carregando biblioteca...</span>
              </div>
            ) : mediaList.length === 0 ? (
              <div className="text-center py-20 text-[#64748B]">
                <span className="material-symbols-outlined text-[48px] mb-2 text-slate-300">
                  hide_image
                </span>
                <p className="text-sm font-medium">Nenhuma mídia encontrada.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {mediaList.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  const inUse =
                    currentUrl && (currentUrl === item.url || currentUrl.endsWith(item.filename));
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`text-left group relative rounded-xl overflow-hidden border-2 bg-white transition-all ${
                        isSelected
                          ? 'border-[#00C6F7] ring-4 ring-[#00C6F7]/20 shadow-md'
                          : 'border-[#E2E8F0] hover:border-slate-400'
                      }`}
                    >
                      <div className="aspect-square bg-slate-100 relative overflow-hidden flex items-center justify-center">
                        <img
                          src={formatMediaUrl(item.url)}
                          alt={item.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-[#00C6F7] text-[#0F172A] rounded-full w-6 h-6 flex items-center justify-center shadow">
                            <span className="material-symbols-outlined text-[16px] font-bold">
                              check
                            </span>
                          </div>
                        )}
                        {inUse && (
                          <div className="absolute bottom-2 left-2 bg-[#0F172A]/90 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                            Em uso
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-semibold text-[#0F172A] truncate">
                          {item.filename}
                        </p>
                        <p className="text-[10px] text-[#64748B]">
                          {item.size_bytes ? `${Math.round(item.size_bytes / 1024)} KB` : 'R2'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedItem && (
            <div className="w-72 border-l border-[#E2E8F0] bg-white p-5 flex flex-col justify-between overflow-y-auto">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">
                  Pré-visualização
                </h4>
                <div className="aspect-square bg-slate-100 rounded-xl overflow-hidden border border-[#E2E8F0] mb-4 flex items-center justify-center">
                  <img
                    src={formatMediaUrl(selectedItem.url)}
                    alt={selectedItem.filename}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-2 text-xs text-[#64748B]">
                  <div>
                    <span className="font-bold text-[#0F172A] block">Arquivo:</span>
                    <span className="break-all">{selectedItem.filename}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#0F172A] block">URL:</span>
                    <span className="break-all font-mono text-[11px] bg-[#F7F9FB] p-1.5 rounded block mt-0.5 border border-[#E2E8F0]">
                      {formatMediaUrl(selectedItem.url)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E2E8F0] mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="w-full bg-[#00C6F7] hover:bg-[#00b0dc] text-[#0F172A] py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">done</span>
                  <span>Usar Esta Imagem</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-[#0F172A] py-2 rounded-lg font-bold text-xs uppercase tracking-wider"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
