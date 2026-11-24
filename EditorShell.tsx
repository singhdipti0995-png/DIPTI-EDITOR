import type { ReactNode } from 'react';
import { Film, Home, Image as ImageIcon, Settings, Sparkles, User } from 'lucide-react';
import type { EditorTab } from '../../types/editor';

interface EditorShellProps {
  activeTab: EditorTab;
  creatorName: string;
  onSelectTab: (tab: EditorTab) => void;
  onOpenSettings: () => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: EditorTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'photo', label: 'Photo', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'ai-studio', label: 'AI Studio', icon: Sparkles },
  { id: 'profile', label: 'Profile', icon: User },
];

export function DiptiLogoMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="diptiPrismGrad" x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d4af37" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="32" height="32" rx="9" fill="#080d1b" stroke="url(#diptiPrismGrad)" strokeWidth="1.6" />
      <path
        d="M18 8.5L27 25H9L18 8.5Z"
        fill="#050814"
        stroke="url(#diptiPrismGrad)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M18 14L22.5 22H13.5L18 14Z" fill="#d4af37" fillOpacity="0.28" />
    </svg>
  );
}

export function EditorShell({
  activeTab,
  creatorName,
  onSelectTab,
  onOpenSettings,
  children,
}: EditorShellProps) {
  const initials = creatorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'DS';

  return (
    <div className="min-h-dvh bg-[#03050a] text-slate-100 relative selection:bg-[#d4af37]/30 selection:text-amber-100">
      {/* Subtle architectural ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div
          className="absolute -top-40 left-1/4 w-[520px] h-[340px] rounded-full blur-[130px] opacity-25"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/3 -right-32 w-[420px] h-[420px] rounded-full blur-[140px] opacity-20"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-32 left-10 w-[380px] h-[300px] rounded-full blur-[130px] opacity-15"
          style={{ background: 'radial-gradient(circle, #d4af37 0%, transparent 72%)' }}
        />
      </div>

      {/* Top 3-Zone Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#040712]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Brand */}
          <button
            type="button"
            onClick={() => onSelectTab('home')}
            className="flex items-center gap-3 min-h-[44px] text-left group focus:outline-none"
          >
            <DiptiLogoMark />
            <div className="min-w-0">
              <span className="block font-display text-lg sm:text-xl font-semibold tracking-wide text-slate-50 whitespace-nowrap leading-none">
                DIPTI EDITOR
              </span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-[#d4af37]/85 whitespace-nowrap mt-1 leading-none">
                by DIPTI SINGH
              </span>
            </div>
          </button>

          {/* Zone 2: Center Desktop Links (hidden on mobile) */}
          <nav aria-label="Primary studio navigation" className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.filter((item) => item.id !== 'profile').map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`min-h-[40px] px-3.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-gradient-to-r from-[#d4af37]/18 via-[#8b5cf6]/18 to-[#3b82f6]/18 text-amber-100 border border-[#d4af37]/35'
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#d4af37]' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Right Actions (Profile & Settings) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              aria-label="Open creator profile"
              className={`min-h-[44px] min-w-[44px] px-2.5 rounded-xl flex items-center gap-2 transition-colors border ${
                activeTab === 'profile'
                  ? 'border-[#d4af37]/50 bg-[#d4af37]/12 text-amber-100'
                  : 'border-white/10 bg-[#0b1224]/80 text-slate-200 hover:border-white/25'
              }`}
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#d4af37] via-[#8b5cf6] to-[#3b82f6] text-[#03050a] text-xs font-bold flex items-center justify-center shrink-0">
                {initials}
              </span>
              <span className="hidden sm:inline text-xs font-semibold tracking-wide whitespace-nowrap">
                Profile
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Open studio settings"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-white/10 bg-[#0b1224]/80 text-slate-300 hover:text-white hover:border-[#d4af37]/40 flex items-center justify-center transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Shell with Tablet/Desktop Left Rail */}
      <div className="relative z-10 max-w-7xl mx-auto flex">
        <aside
          aria-label="Studio workspace rail"
          className="hidden lg:flex flex-col w-56 shrink-0 py-6 pl-6 pr-3 sticky top-16 h-[calc(100dvh-4rem)]"
        >
          <div className="glass-surface rounded-2xl p-3 flex flex-col gap-1.5 flex-1">
            <div className="px-3 pt-1 pb-2 border-b border-white/[0.06]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Workspaces</p>
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`min-h-[44px] w-full px-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors text-left ${
                    isActive
                      ? 'bg-gradient-to-r from-[#d4af37]/16 via-[#8b5cf6]/16 to-transparent text-white border border-[#d4af37]/30'
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#d4af37]' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            <div className="mt-auto pt-3 border-t border-white/[0.06] px-2">
              <p className="text-xs font-medium text-slate-200 truncate">DIPTI EDITOR</p>
              <p className="text-[11px] text-slate-400 truncate">Studio by DIPTI SINGH</p>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pt-5 pb-24 md:pb-12">
          {children}
        </main>
      </div>

      {/* Android-friendly Fixed Bottom Navigation Bar (Mobile & Compact Tablets) */}
      <nav
        aria-label="Bottom navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.1] bg-[#040712]/92 backdrop-blur-xl px-2 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16 max-w-lg mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className="flex flex-col items-center justify-center gap-1 min-h-[44px] focus:outline-none"
              >
                <span
                  className={`w-9 h-6 rounded-lg flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-gradient-to-r from-[#d4af37]/25 via-[#8b5cf6]/25 to-[#3b82f6]/25 text-[#f4d47c]'
                      : 'text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span
                  className={`text-[11px] font-medium whitespace-nowrap leading-none ${
                    isActive ? 'text-amber-100' : 'text-slate-400'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
