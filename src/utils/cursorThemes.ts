export interface CursorStyle {
  id: string;
  name: string;
  arrow: string;
  hand: string;
  hotspot: readonly [number, number];
  handHotspot: readonly [number, number];
}

export const CURSOR_STYLES = [
  {
    "id": "ice-rounded",
    "name": "Ice Rounded",
    "arrow": "/cursors/ice-rounded/arrow.svg",
    "hand": "/cursors/ice-rounded/hand.svg",
    "hotspot": [
      4,
      3
    ],
    "handHotspot": [
      12,
      3
    ]
  },
  {
    "id": "bibata-modern-ice",
    "name": "Bibata Modern Ice",
    "arrow": "/cursors/bibata-modern-ice/arrow.svg",
    "hand": "/cursors/bibata-modern-ice/hand.svg",
    "hotspot": [
      7,
      2
    ],
    "handHotspot": [
      14,
      2
    ]
  },
  {
    "id": "bibata-modern-classic",
    "name": "Bibata Modern Classic",
    "arrow": "/cursors/bibata-modern-classic/arrow.svg",
    "hand": "/cursors/bibata-modern-classic/hand.svg",
    "hotspot": [
      7,
      2
    ],
    "handHotspot": [
      14,
      2
    ]
  },
  {
    "id": "bibata-modern-amber",
    "name": "Bibata Modern Amber",
    "arrow": "/cursors/bibata-modern-amber/arrow.svg",
    "hand": "/cursors/bibata-modern-amber/hand.svg",
    "hotspot": [
      7,
      2
    ],
    "handHotspot": [
      14,
      2
    ]
  },
  {
    "id": "bibata-original-ice",
    "name": "Bibata Original Ice",
    "arrow": "/cursors/bibata-original-ice/arrow.svg",
    "hand": "/cursors/bibata-original-ice/hand.svg",
    "hotspot": [
      7,
      2
    ],
    "handHotspot": [
      14,
      2
    ]
  },
  {
    "id": "phinger-light",
    "name": "Phinger Light",
    "arrow": "/cursors/phinger-light/arrow.svg",
    "hand": "/cursors/phinger-light/hand.svg",
    "hotspot": [
      1,
      1
    ],
    "handHotspot": [
      13,
      5
    ]
  },
  {
    "id": "phinger-dark",
    "name": "Phinger Dark",
    "arrow": "/cursors/phinger-dark/arrow.svg",
    "hand": "/cursors/phinger-dark/hand.svg",
    "hotspot": [
      1,
      1
    ],
    "handHotspot": [
      13,
      5
    ]
  },
  {
    "id": "whitesur",
    "name": "WhiteSur",
    "arrow": "/cursors/whitesur/arrow.svg",
    "hand": "/cursors/whitesur/hand.svg",
    "hotspot": [
      8,
      7
    ],
    "handHotspot": [
      17,
      11
    ]
  },
  {
    "id": "vimix",
    "name": "Vimix",
    "arrow": "/cursors/vimix/arrow.svg",
    "hand": "/cursors/vimix/hand.svg",
    "hotspot": [
      8,
      7
    ],
    "handHotspot": [
      17,
      11
    ]
  },
  {
    "id": "nordzy-nordic",
    "name": "Nordzy Nordic",
    "arrow": "/cursors/nordzy-nordic/arrow.png",
    "hand": "/cursors/nordzy-nordic/hand.png",
    "hotspot": [
      3,
      2
    ],
    "handHotspot": [
      9,
      3
    ]
  },
  {
    "id": "nordzy-mocha-mauve",
    "name": "Nordzy Mocha Mauve",
    "arrow": "/cursors/nordzy-mocha-mauve/arrow.png",
    "hand": "/cursors/nordzy-mocha-mauve/hand.png",
    "hotspot": [
      3,
      2
    ],
    "handHotspot": [
      9,
      3
    ]
  },
  {
    "id": "nordzy-mocha-teal",
    "name": "Nordzy Mocha Teal",
    "arrow": "/cursors/nordzy-mocha-teal/arrow.png",
    "hand": "/cursors/nordzy-mocha-teal/hand.png",
    "hotspot": [
      3,
      2
    ],
    "handHotspot": [
      9,
      3
    ]
  },
  {
    "id": "google-dot-blue",
    "name": "GoogleDot Blue",
    "arrow": "/cursors/google-dot-blue/arrow.png",
    "hand": "/cursors/google-dot-blue/hand.png",
    "hotspot": [
      16,
      16
    ],
    "handHotspot": [
      16,
      16
    ]
  },
  {
    "id": "google-dot-white",
    "name": "GoogleDot White",
    "arrow": "/cursors/google-dot-white/arrow.png",
    "hand": "/cursors/google-dot-white/hand.png",
    "hotspot": [
      16,
      16
    ],
    "handHotspot": [
      16,
      16
    ]
  }
] as const satisfies readonly CursorStyle[];

export type CursorThemeId = 'system' | typeof CURSOR_STYLES[number]['id'];

export function normalizeCursorTheme(value: unknown): CursorThemeId {
  return CURSOR_STYLES.some(style => style.id === value) ? value as CursorThemeId : 'system';
}

export function getCursorStyle(id: CursorThemeId) {
  return CURSOR_STYLES.find(style => style.id === id);
}

export function applyCursorTheme(id: CursorThemeId) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const style = getCursorStyle(id);
  if (style) {
    root.style.setProperty('--app-cursor-default', `url("${style.arrow}") ${style.hotspot.join(' ')}, default`);
    root.style.setProperty('--app-cursor-pointer', `url("${style.hand}") ${style.handHotspot.join(' ')}, pointer`);
  } else {
    root.style.removeProperty('--app-cursor-default');
    root.style.removeProperty('--app-cursor-pointer');
  }
  root.dataset.cursorTheme = style?.id || 'system';
}
