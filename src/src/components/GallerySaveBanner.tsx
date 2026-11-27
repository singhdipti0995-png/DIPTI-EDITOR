import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CopyCheck,
  FolderCheck,
  Loader2,
  Smartphone,
  X,
} from 'lucide-react';
import { GallerySaveResult } from '../utils/gallerySaveEngine';
import { formatBytes } from '../utils/indexedDbStorage';

interface GallerySaveBannerProps {
  saving: boolean;
  progressPct?: number;
  stageLabel?: string | null;
  result: GallerySaveResult | null;
  onSaveCopyAnyway?: () => void;
  onDismiss?: () => void;
}

export const GallerySaveBanner: React.FC<GallerySaveBannerProps> = ({
  saving,
  progressPct = 0,
  stageLabel,
  result,
  onSaveCopyAnyway,
  onDismiss,
}) => {
  if (!saving && !result) return null;

  if (saving) {
    return (
      <div className="rounded-xl bg-[#0B1020] border border-amber-400/35 px-3.5 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-amber-200">
          <span className="flex items-center gap-2 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300 shrink-0" />
            <span>{stageLabel || 'Saving to Gallery...'}</span>
          </span>
          <span className="font-mono-tabular text-amber-300 font-semibold">{progressPct}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-purple-400 to-amber-400 transition-all duration-150"
            style={{ width: `${Math.max(6, Math.min(100, progressPct))}%` }}
          />
        </div>
      </div>
    );
  }

  if (!result) return null;

  if (result.skippedBySetting && !result.error) {
    return (
      <div className="rounded-xl bg-white/[0.04] border border-white/15 px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs text-slate-300">
        <span className="leading-relaxed">{result.statusMessage}</span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-slate-400 hover:text-white cursor-pointer shrink-0"
            aria-label="Dismiss gallery notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (result.duplicatePrevented) {
    return (
      <div className="rounded-xl bg-amber-500/10 border border-amber-400/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs text-amber-100">
        <span className="flex items-start gap-2 min-w-0 flex-1">
          <CopyCheck className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{result.statusMessage}</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {onSaveCopyAnyway && (
            <button
              type="button"
              onClick={onSaveCopyAnyway}
              className="min-h-[34px] px-3 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/45 text-[11px] font-semibold text-amber-100 cursor-pointer whitespace-nowrap"
            >
              Save Copy Anyway
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 text-amber-200 hover:text-white cursor-pointer"
              aria-label="Dismiss duplicate notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!result.saved || result.error) {
    return (
      <div className="rounded-xl bg-rose-500/12 border border-rose-400/40 px-3.5 py-2.5 flex items-start justify-between gap-2.5 text-xs text-rose-200">
        <span className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{result.error || result.statusMessage}</span>
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-rose-200 hover:text-white cursor-pointer shrink-0"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  const channelBadge =
    result.delivery === 'android-mediastore'
      ? `Android MediaStore · ${result.albumName}`
      : result.delivery === 'saf-directory'
        ? `Linked Device Folder · ${result.albumName}`
        : 'Browser Downloads (Web Mode)';

  return (
    <div
      className={`rounded-xl px-3.5 py-2.5 flex items-start justify-between gap-2.5 text-xs border ${
        result.isDirectGallery
          ? 'bg-emerald-500/10 border-emerald-400/35 text-emerald-100'
          : 'bg-violet-500/12 border-violet-400/35 text-slate-100'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {result.delivery === 'android-mediastore' ? (
          <Smartphone className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
        ) : result.delivery === 'saf-directory' ? (
          <FolderCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
        )}
        <div className="space-y-0.5 min-w-0">
          <p className="font-semibold text-white">
            {channelBadge} · {formatBytes(result.sizeBytes)}
          </p>
          <p className="text-[11px] text-slate-300 leading-relaxed break-words">
            {result.statusMessage}
          </p>
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-400 hover:text-white cursor-pointer shrink-0"
          aria-label="Dismiss saved notice"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
