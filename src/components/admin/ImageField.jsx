import React, { useState } from 'react';
import MediaPickerModal, { formatMediaUrl } from './MediaPickerModal.jsx';

export default function ImageField({ label, value = '', onChange, helperText = '' }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A]">
          {label}
        </label>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F7F9FB]">
        <div className="w-20 h-20 rounded-lg overflow-hidden border border-[#E2E8F0] bg-white flex items-center justify-center flex-shrink-0">
          {value ? (
            <img
              src={formatMediaUrl(value)}
              alt="Pré-visualização"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="material-symbols-outlined text-slate-400 text-[24px]">
              image_not_supported
            </span>
          )}
        </div>

        <div className="flex-1 w-full space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="/assets/covers/album-01.jpg ou /uploads/..."
              className="flex-1 min-w-[180px] text-xs font-mono text-[#0F172A] bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
            />
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0F172A] hover:bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] text-[#00C6F7]">
                photo_library
              </span>
              <span>Alterar / R2</span>
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="p-2 text-[#64748B] hover:text-[#F75656] rounded-lg hover:bg-slate-200 transition-colors"
                title="Limpar imagem"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}
          </div>
          {helperText && <p className="text-[11px] text-[#64748B]">{helperText}</p>}
        </div>
      </div>

      <MediaPickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={(newUrl) => onChange(newUrl)}
        currentUrl={value}
      />
    </div>
  );
}
