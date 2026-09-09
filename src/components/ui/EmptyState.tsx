import React from 'react';
import { cn } from '@/utils/cn';

type Variant = 'check' | 'search' | 'inbox' | 'branch' | 'stash';

interface EmptyStateProps {
  variant?: Variant;
  title: string;
  desc?: string;
  className?: string;
}

/** 主题色描边的小插画：不同场景复用同一套线条风格 */
const Illustration: React.FC<{ variant: Variant }> = ({ variant }) => {
  const common = {
    fill: 'none',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 96 72" className="h-16 w-20 mx-auto" aria-hidden>
      {variant === 'check' && (
        <g stroke="currentColor" {...common}>
          <circle cx="48" cy="36" r="22" className="text-emerald-500/40" />
          <path d="M38 36.5l7 7 14-15" className="text-emerald-500/80" strokeWidth={2.5} />
        </g>
      )}
      {variant === 'search' && (
        <g stroke="currentColor" {...common}>
          <circle cx="44" cy="32" r="16" className="text-cyan-500/50" />
          <path d="M56 44l12 12" className="text-cyan-500/80" strokeWidth={2.5} />
          <path d="M38 30c1.5-3.5 5-5.5 8.5-5" opacity={0.6} />
        </g>
      )}
      {variant === 'inbox' && (
        <g stroke="currentColor" {...common}>
          <path d="M24 40v14a4 4 0 004 4h40a4 4 0 004-4V40" className="text-cyan-500/50" />
          <path d="M24 40l6-18h36l6 18h-12a8 8 0 01-16 0H24z" className="text-cyan-500/70" />
          <path d="M48 14v14m0 0l-5-5m5 5l5-5" className="text-cyan-500/40" />
        </g>
      )}
      {variant === 'branch' && (
        <g stroke="currentColor" {...common}>
          <path d="M34 22v28" className="text-cyan-500/60" />
          <path d="M62 22v10c0 8-8 8-14 10" className="text-cyan-500/40" />
          <circle cx="34" cy="16" r="6" className="text-cyan-500/70" />
          <circle cx="62" cy="16" r="6" className="text-cyan-500/50" />
          <circle cx="44" cy="50" r="6" className="text-cyan-500/50" />
        </g>
      )}
      {variant === 'stash' && (
        <g stroke="currentColor" {...common}>
          <path d="M30 30h36l-4 26a4 4 0 01-4 3.5H38a4 4 0 01-4-3.5L30 30z" className="text-cyan-500/60" />
          <path d="M38 30c0-6 4-10 10-10s10 4 10 10" className="text-cyan-500/40" />
          <path d="M38 42h20M39 48h18" opacity={0.5} />
        </g>
      )}
    </svg>
  );
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'inbox',
  title,
  desc,
  className,
}) => {
  return (
    <div className={cn('py-14 px-4 text-center space-y-1 select-none', className)}>
      <div className="text-muted-foreground/50 mb-2">
        <Illustration variant={variant} />
      </div>
      <div className="text-xs font-medium text-foreground/85">{title}</div>
      {desc && <div className="text-[11px] text-muted-foreground leading-relaxed max-w-[260px] mx-auto">{desc}</div>}
    </div>
  );
};
