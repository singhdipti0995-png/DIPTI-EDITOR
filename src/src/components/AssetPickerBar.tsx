import React, { useRef } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { STUDIO_ASSETS } from '../data/studioCatalog';

interface AssetPickerBarProps {
  activeImageUrl: string;
  onSelectImage: (url: string, label?: string) => void;
  compact?: boolean;
}

export const AssetPickerBar: React.FC<AssetPickerBarProps> = ({
  activeImageUrl,
  onSelectImage,
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSelectImage(reader.result, file.name.replace(/\.[^.]+$/, ''));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600/30 to-sky-600/30 hover:from-violet-600/45 hover:to-sky-600/45 border border-sky-400/30 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
      >
        <Upload className="w-3.5 h-3.5 text-sky-300" />
        <span>Gallery / Upload</span>
      </button>

      <div className="h-6 w-px bg-white/10 shrink-0" aria-hidden="true" />

      {STUDIO_ASSETS.map((asset) => {
        const isActive = activeImageUrl === asset.url;
        return (
          <button
            key={asset.id}
            type="button"
            onClick={() => onSelectImage(asset.url, asset.title)}
            title={asset.title}
            className={`group min-h-[44px] flex items-center gap-2 rounded-xl border px-2 py-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              isActive
                ? 'bg-white/12 border-amber-400/60 text-white shadow-[0_0_16px_rgba(212,175,55,0.2)]'
                : 'bg-[#0D1326]/80 border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
            }`}
          >
            <div className="w-7 h-7 rounded-lg overflow-hidden bg-slate-900 shrink-0 flex items-center justify-center">
              <img
                src={asset.url}
                alt={asset.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                onError={(ev) => {
                  (ev.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <ImageIcon className="w-3.5 h-3.5 text-slate-500 hidden" />
            </div>
            {!compact && <span className="text-xs font-medium pr-1">{asset.title}</span>}
          </button>
        );
      })}
    </div>
  );
};
