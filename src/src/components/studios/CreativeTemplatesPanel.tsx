import React, { useState } from 'react';
import { LayoutTemplate, ArrowUpRight, Sparkles } from 'lucide-react';
import { DESIGN_TEMPLATES } from '../../data/typographyCatalog';
import { DesignCanvasCategory, TypographyDesignDoc } from '../../types/typography';

interface CreativeTemplatesPanelProps {
  onLaunchTemplate: (doc: TypographyDesignDoc, attachCurrentArtwork: boolean) => void;
}

const TEMPLATE_GROUPS: Array<{ id: Extract<DesignCanvasCategory, 'poster' | 'thumbnail' | 'instagram'>; label: string }> = [
  { id: 'poster', label: 'Posters' },
  { id: 'thumbnail', label: 'YouTube Thumbnails' },
  { id: 'instagram', label: 'Social Media' },
];

export const CreativeTemplatesPanel: React.FC<CreativeTemplatesPanelProps> = ({
  onLaunchTemplate,
}) => {
  const [group, setGroup] = useState<'poster' | 'thumbnail' | 'instagram'>('poster');
  const [attachArtwork, setAttachArtwork] = useState(true);

  const items = DESIGN_TEMPLATES.filter((t) => t.category === group);

  return (
    <div className="space-y-3.5">
      <div className="rounded-xl bg-violet-500/10 border border-violet-400/25 px-3 py-2 text-xs text-slate-300 leading-relaxed">
        Launch any <strong className="text-white">Poster</strong>, <strong className="text-white">Thumbnail</strong>, or <strong className="text-white">Social Media</strong> template inside Typography &amp; Motion Studio with live editable text, shapes, and PNG export.
      </div>

      {/* Template Category Switch */}
      <div className="grid grid-cols-3 gap-1.5">
        {TEMPLATE_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={`min-h-[40px] px-2 rounded-xl border text-[11px] font-semibold cursor-pointer transition-colors ${
              group === g.id
                ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/20 border-amber-400/60 text-white'
                : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Attach Current Canvas Artwork Toggle */}
      <label className="flex items-center justify-between gap-3 rounded-xl bg-[#06070B] border border-white/10 px-3 py-2.5 cursor-pointer">
        <span className="text-xs text-slate-200 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>Use current preview as template backdrop</span>
        </span>
        <input
          type="checkbox"
          checked={attachArtwork}
          onChange={(e) => setAttachArtwork(e.target.checked)}
          className="accent-amber-400 w-4 h-4 cursor-pointer"
        />
      </label>

      {/* Template Cards */}
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
        {items.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onLaunchTemplate(tpl.doc, attachArtwork)}
            className="w-full min-h-[60px] p-3 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-white/10 hover:border-amber-400/50 text-left flex items-center justify-between gap-3 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-lg border border-white/15 shrink-0 flex items-center justify-center"
                style={{
                  background: `linear-gradient(${tpl.doc.background.gradientAngle}deg, ${tpl.doc.background.gradientStart}, ${tpl.doc.background.gradientEnd})`,
                }}
              >
                <LayoutTemplate className="w-4 h-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{tpl.name}</p>
                <p className="text-[11px] font-mono-tabular text-slate-400 mt-0.5">
                  {tpl.sizeLabel} · {tpl.doc.layers.length} layers
                </p>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-amber-300 shrink-0 opacity-75 group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
};
