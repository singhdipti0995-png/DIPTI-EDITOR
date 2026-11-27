import React from 'react';
import { Sparkles, Wand2, Trash2, Clock, Info, Cpu } from 'lucide-react';
import { ART_STYLE_OPTIONS, CreativeStyleId } from '../../data/creativePresets';
import { CreativePromptEntry } from '../../utils/storage';
import { ConceptArtRecipe } from '../../utils/creativeCanvas';

interface CreativePromptPanelProps {
  prompt: string;
  onChangePrompt: (val: string) => void;
  selectedStyle: CreativeStyleId;
  onSelectStyle: (style: CreativeStyleId) => void;
  aspect: '1:1' | '16:9' | '9:16' | '4:5';
  onSelectAspect: (aspect: '1:1' | '16:9' | '9:16' | '4:5') => void;
  promptHistory: CreativePromptEntry[];
  onReuseHistory: (entry: CreativePromptEntry) => void;
  onDeleteHistory: (id: string) => void;
  onTryExternalAiApi: () => void;
  onComposeLocalBackdrop: (recipe: ConceptArtRecipe) => void;
  onApplyStyleToActivePhoto: (style: CreativeStyleId) => void;
  aiLoading: boolean;
}

const LOCAL_BACKDROP_MAP: Record<CreativeStyleId, ConceptArtRecipe> = {
  'anime-cel': {
    title: 'Twilight Cel Sky',
    description: 'Local procedural aurora gradient backdrop',
    pattern: 'aurora',
    bgHex: '#090616',
    primaryHex: '#A855F7',
    secondaryHex: '#38BDF8',
    highlightHex: '#FDE047',
    angleDeg: 28,
    complexity: 8,
  },
  'pencil-sketch': {
    title: 'Monochrome Study',
    description: 'Local procedural prism geometric composition',
    pattern: 'crystal-mesh',
    bgHex: '#0B0D14',
    primaryHex: '#475569',
    secondaryHex: '#94A3B8',
    highlightHex: '#F8FAFC',
    angleDeg: 45,
    complexity: 6,
  },
  watercolor: {
    title: 'Aquarelle Mist',
    description: 'Local procedural soft-wave wash backdrop',
    pattern: 'prism-waves',
    bgHex: '#07121E',
    primaryHex: '#38BDF8',
    secondaryHex: '#818CF8',
    highlightHex: '#FDE68A',
    angleDeg: 62,
    complexity: 9,
  },
  'oil-paint': {
    title: 'Gilded Nocturne',
    description: 'Local procedural warm-gold solar halo backdrop',
    pattern: 'solar-eclipse',
    bgHex: '#120C06',
    primaryHex: '#92400E',
    secondaryHex: '#D4AF37',
    highlightHex: '#FEF08A',
    angleDeg: 18,
    complexity: 7,
  },
  'double-exposure': {
    title: 'Amethyst Eclipse',
    description: 'Local procedural double-tone eclipse canvas',
    pattern: 'solar-eclipse',
    bgHex: '#090414',
    primaryHex: '#7C3AED',
    secondaryHex: '#C084FC',
    highlightHex: '#FBBF24',
    angleDeg: 40,
    complexity: 7,
  },
  'colorize-warm': {
    title: 'Amber Horizon',
    description: 'Local procedural golden-amber atmospheric canvas',
    pattern: 'aurora',
    bgHex: '#140B06',
    primaryHex: '#D97706',
    secondaryHex: '#7C2D12',
    highlightHex: '#FDE047',
    angleDeg: 22,
    complexity: 6,
  },
  'cyber-neon': {
    title: 'Cyber Horizon Grid',
    description: 'Local procedural vector neon grid canvas',
    pattern: 'neon-grid',
    bgHex: '#060712',
    primaryHex: '#A855F7',
    secondaryHex: '#EC4899',
    highlightHex: '#38BDF8',
    angleDeg: 0,
    complexity: 8,
  },
  'gold-editorial': {
    title: 'Obsidian Crown',
    description: 'Local procedural black & metallic gold backdrop',
    pattern: 'solar-eclipse',
    bgHex: '#050609',
    primaryHex: '#78350F',
    secondaryHex: '#D4AF37',
    highlightHex: '#FDE047',
    angleDeg: 35,
    complexity: 6,
  },
};

export const CreativePromptPanel: React.FC<CreativePromptPanelProps> = ({
  prompt,
  onChangePrompt,
  selectedStyle,
  onSelectStyle,
  aspect,
  onSelectAspect,
  promptHistory,
  onReuseHistory,
  onDeleteHistory,
  onTryExternalAiApi,
  onComposeLocalBackdrop,
  onApplyStyleToActivePhoto,
  aiLoading,
}) => {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 px-3 py-2.5 flex items-start gap-2.5 text-xs text-amber-100/90 leading-relaxed">
        <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Honest Model Boundary:</span> Photorealistic text-to-image diffusion requires an external generative AI API key. Below you can either test your configured <code className="text-amber-300">/api/ai/concept-art</code> route, synthesize an honest <strong className="text-white">Local Procedural Canvas Backdrop</strong>, or apply the chosen art style directly onto your active photo.
        </div>
      </div>

      {/* Prompt Input */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-200 block">Creative Prompt</label>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => onChangePrompt(e.target.value)}
          placeholder="Describe mood, subject, lighting, and palette (e.g. Obsidian royal portrait with gold rim light)..."
          className="w-full px-3 py-2.5 rounded-xl bg-[#06070B] border border-white/15 focus:border-amber-400/60 outline-none text-xs text-white placeholder:text-slate-500"
        />
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-slate-200 block">Canvas Aspect Ratio</span>
        <div className="grid grid-cols-4 gap-1.5">
          {(['1:1', '16:9', '9:16', '4:5'] as const).map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => onSelectAspect(ratio)}
              className={`min-h-[40px] rounded-xl border text-xs font-mono-tabular font-semibold cursor-pointer transition-colors ${
                aspect === ratio
                  ? 'bg-amber-400/20 border-amber-400/70 text-amber-200'
                  : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* Art Style Selection */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-slate-200 block">Art Style Direction</span>
        <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
          {ART_STYLE_OPTIONS.map((style) => {
            const active = selectedStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onSelectStyle(style.id)}
                className={`min-h-[50px] p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-gradient-to-br from-violet-600/30 to-amber-500/15 border-amber-400/65 text-white'
                    : 'bg-[#06070B] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: style.accent }}
                  />
                  <span className="text-xs font-semibold truncate">{style.label}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{style.note}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions separating External AI vs Local Engine */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={() => onApplyStyleToActivePhoto(selectedStyle)}
          className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
        >
          <Cpu className="w-4 h-4" />
          <span>Apply Style to Current Photo (Local Canvas)</span>
        </button>

        <button
          type="button"
          onClick={() => onComposeLocalBackdrop(LOCAL_BACKDROP_MAP[selectedStyle])}
          className="w-full min-h-[44px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-amber-400/35 text-xs font-semibold text-amber-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>Compose Procedural Backdrop (Local Canvas)</span>
        </button>

        <button
          type="button"
          disabled={aiLoading}
          onClick={onTryExternalAiApi}
          className="w-full min-h-[44px] px-4 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-violet-400/40 disabled:opacity-50 text-xs font-semibold text-violet-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Wand2 className="w-4 h-4 text-violet-300" />
          <span>{aiLoading ? 'Contacting External AI...' : 'Synthesize via External AI API'}</span>
        </button>
      </div>

      {/* Prompt History */}
      <div className="space-y-2 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-300" />
            <span>Prompt History</span>
          </span>
          <span className="text-[11px] font-mono-tabular text-slate-400">{promptHistory.length}</span>
        </div>

        {promptHistory.length === 0 ? (
          <p className="text-[11px] text-slate-500 py-2">
            Saved prompts appear here automatically when you generate a backdrop or test External AI.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
            {promptHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-[#06070B] border border-white/[0.08] px-2.5 py-2"
              >
                <button
                  type="button"
                  onClick={() => onReuseHistory(item)}
                  className="text-left min-w-0 flex-1 cursor-pointer"
                >
                  <p className="text-[11px] text-white font-medium truncate">{item.prompt}</p>
                  <p className="text-[10px] text-slate-400 font-mono-tabular truncate">
                    {item.styleLabel} · {item.aspect}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteHistory(item.id)}
                  className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-rose-500/15 text-slate-500 hover:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="Delete prompt history item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
