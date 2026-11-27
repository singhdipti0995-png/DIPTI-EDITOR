import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', showWordmark = true }) => {
  const iconDim = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-8 h-8';
  const textClass =
    size === 'sm'
      ? 'text-base tracking-tight'
      : size === 'lg'
        ? 'text-2xl tracking-tight'
        : 'text-lg tracking-tight';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <div
        className={`${iconDim} relative flex items-center justify-center rounded-xl bg-[#0D1326] border border-white/15 shadow-[0_0_24px_rgba(124,58,237,0.28)]`}
      >
        <svg viewBox="0 0 40 40" fill="none" className="w-5/6 h-5/6" aria-hidden="true">
          <defs>
            <linearGradient id="diptiPrism" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="55%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#D4AF37" />
            </linearGradient>
            <linearGradient id="diptiGold" x1="12" y1="12" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#D4AF37" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="32" height="32" rx="9" stroke="url(#diptiPrism)" strokeWidth="2.2" />
          <path
            d="M14 11.5H20.5C25.2 11.5 28.5 14.8 28.5 20C28.5 25.2 25.2 28.5 20.5 28.5H14V11.5Z"
            stroke="url(#diptiPrism)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="20.2" cy="20" r="3.4" fill="url(#diptiGold)" />
        </svg>
      </div>
      {showWordmark && (
        <span className={`font-display font-bold text-white whitespace-nowrap shrink-0 ${textClass}`}>
          DIPTI <span className="text-amber-300">EDITOR</span>
        </span>
      )}
    </div>
  );
};
