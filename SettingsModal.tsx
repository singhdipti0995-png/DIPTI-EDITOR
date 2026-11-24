import { Check, RotateCcw, X } from 'lucide-react';
import type { EditorSettings } from '../../types/editor';

interface SettingsModalProps {
  isOpen: boolean;
  settings: EditorSettings;
  onClose: () => void;
  onUpdateSettings: (next: EditorSettings) => void;
  onResetSampleProjects: () => void;
}

export function SettingsModal({
  isOpen,
  settings,
  onClose,
  onUpdateSettings,
  onResetSampleProjects,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-settings-title"
    >
      <div className="glass-gold-edge rounded-3xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <h2 id="studio-settings-title" className="text-lg font-semibold text-white">
              Studio Settings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              DIPTI EDITOR · Developed by DIPTI SINGH
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="settings-creator-name" className="block text-xs font-medium text-slate-300 mb-1.5">
              Creator Display Name
            </label>
            <input
              id="settings-creator-name"
              type="text"
              value={settings.creatorName}
              onChange={(e) => onUpdateSettings({ ...settings, creatorName: e.target.value })}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#050814] border border-white/10 text-sm text-white focus:outline-none focus:border-[#d4af37]/60"
            />
          </div>

          <div>
            <label htmlFor="settings-tagline" className="block text-xs font-medium text-slate-300 mb-1.5">
              Studio Tagline
            </label>
            <input
              id="settings-tagline"
              type="text"
              value={settings.studioTagline}
              onChange={(e) => onUpdateSettings({ ...settings, studioTagline: e.target.value })}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#050814] border border-white/10 text-sm text-white focus:outline-none focus:border-[#d4af37]/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="settings-res" className="block text-xs font-medium text-slate-300 mb-1.5">
                Export Resolution
              </label>
              <select
                id="settings-res"
                value={settings.exportResolution}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    exportResolution: e.target.value as EditorSettings['exportResolution'],
                  })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#050814] border border-white/10 text-sm text-white focus:outline-none focus:border-[#d4af37]/60"
              >
                <option value="720p">720p HD</option>
                <option value="1080p">1080p Full HD</option>
                <option value="4k">4K Ultra Cinema</option>
              </select>
            </div>

            <div>
              <label htmlFor="settings-fmt" className="block text-xs font-medium text-slate-300 mb-1.5">
                Photo Export Format
              </label>
              <select
                id="settings-fmt"
                value={settings.exportFormat}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    exportFormat: e.target.value as EditorSettings['exportFormat'],
                  })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#050814] border border-white/10 text-sm text-white focus:outline-none focus:border-[#d4af37]/60"
              >
                <option value="png">PNG (Lossless Alpha)</option>
                <option value="webp">WebP (Studio Web)</option>
                <option value="jpeg">JPEG (Compact)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#050814]/80 border border-white/[0.06] cursor-pointer min-h-[48px]">
              <span className="text-sm text-slate-200">Auto-save renders to Recent Projects</span>
              <input
                type="checkbox"
                checked={settings.autoSaveProjects}
                onChange={(e) => onUpdateSettings({ ...settings, autoSaveProjects: e.target.checked })}
                className="w-4 h-4 accent-[#d4af37]"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#050814]/80 border border-white/[0.06] cursor-pointer min-h-[48px]">
              <span className="text-sm text-slate-200">High-precision canvas pipeline</span>
              <input
                type="checkbox"
                checked={settings.highPrecisionCanvas}
                onChange={(e) => onUpdateSettings({ ...settings, highPrecisionCanvas: e.target.checked })}
                className="w-4 h-4 accent-[#d4af37]"
              />
            </label>
          </div>
        </div>

        <div className="pt-3 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onResetSampleProjects}
            className="min-h-[44px] px-4 rounded-xl border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] inline-flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Sample Projects</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#e5c158] to-[#c49b27] text-[#050811] text-sm font-semibold inline-flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
