import React, { useMemo } from 'react';
import { identiconSpec } from '@/utils/identicon';
import { cn } from '@/utils/cn';

interface IdenticonProps {
  seed: string;
  /** 像素尺寸（正方形） */
  size?: number;
  className?: string;
}

/** 本地几何 identicon 头像：5x5 镜像点阵，色相锁定品牌安全色板，离线可用 */
export const Identicon: React.FC<IdenticonProps> = ({ seed, size = 18, className }) => {
  const { hue, cells } = useMemo(() => identiconSpec(seed), [seed]);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      aria-hidden="true"
      className={cn('shrink-0', className)}
      style={{ clipPath: 'circle(50%)' }}
    >
      <rect width="5" height="5" fill="hsl(var(--background))" />
      {cells.map((on, i) => on ? (
        <rect key={i} x={i % 5} y={Math.floor(i / 5)} width="1" height="1" fill={`hsl(${hue} 62% 46%)`} />
      ) : null)}
      <circle cx="2.5" cy="2.5" r="2.42" fill="none" stroke="hsl(var(--border))" strokeWidth="0.16" />
    </svg>
  );
};
