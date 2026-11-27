import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Trash2,
  Check,
  HardDrive,
  Smartphone,
  FolderOpen,
  Unlink,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { AppSettings, StorageUsageStats } from '../../types/editor';
import { formatBytes } from '../../utils/indexedDbStorage';
import {
  GalleryRuntimeCapabilities,
  clearGalleryDuplicateHistory,
  detectGalleryRuntimeCapabilities,
  linkDeviceGalleryFolder,
  requestAndroidGalleryPermissions,
  unlinkDeviceGalleryFolder,
} from '../../utils/gallerySaveEngine';
import { SliderControl } from '../SliderControl';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  projectCount: number;
  storageStats?: StorageUsageStats;
  onClearProjects: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  projectCount,
  storageStats,
  onClearProjects,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);
  const [caps, setCaps] = useState<GalleryRuntimeCapabilities | null>(null);
  const [galleryMsg, setGalleryMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshCapabilities = async () => {
    const next = await detectGalleryRuntimeCapabilities();
    setCaps(next);
  };

  useEffect(() => {
    refreshCapabilities();
  }, []);

  const toggle = (
    key:
      | 'showCanvasGrid'
      | 'autoSaveProjects'
      | 'autoSaveToGallery'
      | 'preventDuplicateGallerySaves'
      | 'reducedMotion'
  ) => {
    onUpdateSettings({ ...settings, [key]: !settings[key] });
  };

  const indexedBytes = storageStats
    ? storageStats.projectsBytes + storageStats.historyBytes + storageStats.exportsBytes
    : 0;

  return (
    <div className="max-w-3xl space-y-5 pb-24 lg:pb-8">
      {/* Auto-Save to Phone Gallery */}
      <section className="rounded-2xl bg-[#0B1020]/90 backdrop-blur-xl border border-amber-400/25 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">Auto-Save to Phone Gallery</h2>
              <p className="text-xs text-slate-400">
                Save exported photos &amp; videos to your gallery automatically while keeping editable files separate in My Projects.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoSaveToGallery}
            onClick={() => toggle('autoSaveToGallery')}
            className={`min-h-[40px] min-w-[74px] px-3.5 rounded-xl border text-xs font-mono-tabular font-semibold cursor-pointer transition-colors ${
              settings.autoSaveToGallery
                ? 'bg-gradient-to-r from-violet-600/40 to-amber-500/30 border-amber-400/70 text-white'
                : 'bg-[#060812] border-white/15 text-slate-400'
            }`}
          >
            {settings.autoSaveToGallery ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 block">
              Dedicated Gallery Album / Folder Name
            </label>
            <input
              type="text"
              value={settings.galleryAlbumName}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  galleryAlbumName: e.target.value,
                })
              }
              onBlur={() => {
                if (!settings.galleryAlbumName.trim()) {
                  onUpdateSettings({ ...settings, galleryAlbumName: 'DIPTI EDITOR' });
                }
              }}
              placeholder="DIPTI EDITOR"
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#060812] border border-white/15 focus:border-amber-400/60 outline-none text-xs text-white font-medium"
            />
          </div>

          <div className="rounded-xl bg-[#060812] border border-white/10 p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Prevent Duplicate Saves</p>
              <p className="text-[11px] text-slate-400">
                Skip writing identical unchanged exports twice.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.preventDuplicateGallerySaves}
              onClick={() => toggle('preventDuplicateGallerySaves')}
              className={`min-h-[36px] min-w-[60px] px-2.5 rounded-xl border text-xs font-mono-tabular font-semibold cursor-pointer ${
                settings.preventDuplicateGallerySaves
                  ? 'bg-violet-600/30 border-violet-400 text-white'
                  : 'bg-[#0B1020] border-white/15 text-slate-400'
              }`}
            >
              {settings.preventDuplicateGallerySaves ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Honest Android MediaStore / Web SAF / Browser Download Integration Status */}
        <div className="rounded-xl bg-[#060812] border border-white/10 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
              <span>Active Delivery Mode: {caps?.methodLabel || 'Detecting...'}</span>
            </span>
            {caps?.linkedSafFolderName && (
              <span className="text-[11px] font-mono-tabular text-emerald-300">
                Linked: {caps.linkedSafFolderName}/{settings.galleryAlbumName || 'DIPTI EDITOR'}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {caps?.honestCapabilitySummary}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {caps?.hasAndroidMediaStoreBridge && (
              <button
                type="button"
                onClick={async () => {
                  const res = await requestAndroidGalleryPermissions();
                  setGalleryMsg({
                    ok: res.granted,
                    text: res.granted
                      ? 'Android MediaStore storage access verified.'
                      : res.message || 'Storage permission denied by Android.',
                  });
                }}
                className="min-h-[42px] px-3.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-xs font-semibold text-emerald-100 flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verify Android Gallery Permissions</span>
              </button>
            )}

            {caps?.hasSafDirectoryPicker && (
              <button
                type="button"
                onClick={async () => {
                  const res = await linkDeviceGalleryFolder(settings.galleryAlbumName);
                  setGalleryMsg({
                    ok: res.ok,
                    text: res.ok
                      ? `Linked "${res.albumPath}". Future photo/video exports will save there automatically.`
                      : res.error || 'Could not link folder.',
                  });
                  await refreshCapabilities();
                }}
                className="min-h-[42px] px-3.5 rounded-xl bg-gradient-to-r from-violet-600/35 to-amber-500/25 hover:brightness-110 border border-amber-400/45 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-300" />
                <span>{caps.hasLinkedSafFolder ? 'Change Linked Folder' : 'Link Device Pictures/Movies Folder'}</span>
              </button>
            )}

            {caps?.hasLinkedSafFolder && (
              <button
                type="button"
                onClick={async () => {
                  await unlinkDeviceGalleryFolder();
                  setGalleryMsg({ ok: true, text: 'Unlinked custom device folder. Reverted to browser downloads.' });
                  await refreshCapabilities();
                }}
                className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-medium text-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Unlink Folder</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                clearGalleryDuplicateHistory();
                setGalleryMsg({ ok: true, text: 'Cleared recent duplicate-save fingerprint cache.' });
              }}
              className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-xs font-medium text-slate-300 cursor-pointer"
            >
              Reset Duplicate Cache
            </button>
          </div>

          {galleryMsg && (
            <p
              className={`text-xs flex items-center gap-1.5 ${
                galleryMsg.ok ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {galleryMsg.ok ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{galleryMsg.text}</span>
            </p>
          )}
        </div>
      </section>

      {/* Export Defaults */}
      <section className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/25 flex items-center justify-center">
            <SettingsIcon className="w-4 h-4 text-sky-300" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">Export Pipeline</h2>
            <p className="text-xs text-slate-400">Default file encoding, compression quality, and upscaling preferences.</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-300">Default Photo Export Format</p>
          <div className="grid grid-cols-3 gap-2">
            {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onUpdateSettings({ ...settings, exportFormat: fmt })}
                className={`min-h-[44px] rounded-xl border text-xs font-mono-tabular uppercase font-semibold cursor-pointer transition-colors ${
                  settings.exportFormat === fmt
                    ? 'bg-sky-500/20 border-sky-400 text-white'
                    : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {fmt === 'jpeg' ? 'JPG' : fmt}
              </button>
            ))}
          </div>
        </div>

        <SliderControl
          label="JPG / WebP Compression Quality"
          value={settings.exportQuality}
          min={50}
          max={100}
          defaultValue={95}
          unit="%"
          onChange={(v) => onUpdateSettings({ ...settings, exportQuality: v })}
        />

        <div className="space-y-2 pt-2 border-t border-white/[0.07]">
          <p className="text-xs font-medium text-slate-300">Enhancer Default Upscale Factor</p>
          <div className="grid grid-cols-2 gap-2">
            {(['1x', '2x'] as const).map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => onUpdateSettings({ ...settings, defaultUpscale: scale })}
                className={`min-h-[44px] rounded-xl border text-xs font-mono-tabular font-semibold cursor-pointer ${
                  settings.defaultUpscale === scale
                    ? 'bg-amber-400/20 border-amber-400/60 text-amber-200'
                    : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {scale === '2x' ? '2x High-Res Upscale' : '1x Native Resolution'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Workspace Preferences */}
      <section className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-5 space-y-4">
        <h2 className="font-display text-lg font-bold text-white">Studio Workspace</h2>

        {(
          [
            {
              key: 'showCanvasGrid',
              title: 'Rule-of-Thirds Canvas Guides',
              desc: 'Overlay subtle alignment grid lines over the photo canvas.',
            },
            {
              key: 'autoSaveProjects',
              title: 'Auto-Save Project Changes (My Projects)',
              desc: 'Automatically persist editable Photo & Video project timelines to IndexedDB separately from your Gallery.',
            },
            {
              key: 'reducedMotion',
              title: 'Minimal UI Motion',
              desc: 'Disable decorative panel transitions for faster navigation.',
            },
          ] as const
        ).map((item) => {
          const active = settings[item.key];
          return (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0 border-white/[0.06]"
            >
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-slate-400">{item.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => toggle(item.key)}
                className={`min-h-[36px] min-w-[64px] px-3 rounded-xl border text-xs font-mono-tabular font-semibold cursor-pointer transition-colors ${
                  active
                    ? 'bg-violet-600/30 border-violet-400 text-white'
                    : 'bg-[#060812] border-white/15 text-slate-400'
                }`}
              >
                {active ? 'ON' : 'OFF'}
              </button>
            </div>
          );
        })}
      </section>

      {/* Storage Management */}
      <section className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-amber-300" />
            <span>IndexedDB &amp; Local Storage</span>
          </h2>
          <p className="text-xs text-slate-400 font-mono-tabular">
            {projectCount} editable {projectCount === 1 ? 'project' : 'projects'} · {formatBytes(indexedBytes)} IndexedDB
            {storageStats ? ` · ${storageStats.historyCount} revisions · ${storageStats.exportCount} export logs` : ''}
          </p>
        </div>

        {clearedNotice ? (
          <span className="text-xs text-emerald-300 flex items-center gap-1.5 font-medium">
            <Check className="w-4 h-4" />
            Cleared saved projects
          </span>
        ) : confirmClear ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClearProjects();
                setConfirmClear(false);
                setClearedNotice(true);
                setTimeout(() => setClearedNotice(false), 2500);
              }}
              className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white cursor-pointer"
            >
              Confirm Clear All
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="min-h-[42px] px-4 rounded-xl bg-white/10 text-xs font-medium text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={projectCount === 0}
            onClick={() => setConfirmClear(true)}
            className="min-h-[42px] px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 border border-rose-400/25 text-xs font-semibold text-rose-200 flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Projects</span>
          </button>
        )}
      </section>
    </div>
  );
};
