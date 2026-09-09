import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';

interface ShortcutCheatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutRow {
  combo: string;
  descKey: string;
}

export const ShortcutCheatSheet: React.FC<ShortcutCheatSheetProps> = ({ open, onOpenChange }) => {
  const { t } = useI18n();

  if (!open) return null;

  const groups: Array<{ titleKey: string; rows: ShortcutRow[] }> = [
    {
      titleKey: 'cheatsheet.group.global',
      rows: [
        { combo: 'Ctrl + K', descKey: 'settings.shortcuts.cmdPalette' },
        { combo: 'Ctrl + ,', descKey: 'settings.shortcuts.openSettings' },
        { combo: 'Ctrl + `', descKey: 'settings.shortcuts.toggleTerminal' },
        { combo: '?', descKey: 'settings.shortcuts.cheatSheet' },
      ],
    },
    {
      titleKey: 'cheatsheet.group.git',
      rows: [
        { combo: 'Ctrl + Shift + F', descKey: 'settings.shortcuts.fetch' },
        { combo: 'Ctrl + L', descKey: 'settings.shortcuts.pull' },
        { combo: 'Ctrl + P', descKey: 'settings.shortcuts.push' },
        { combo: 'Ctrl + Enter', descKey: 'settings.shortcuts.commit' },
      ],
    },
    {
      titleKey: 'cheatsheet.group.view',
      rows: [
        { combo: 'Alt + 1 ~ 4', descKey: 'settings.shortcuts.switchViews' },
        { combo: 'Ctrl + Alt + F', descKey: 'settings.shortcuts.filterFocus' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 border-b border-border/70 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground">{t('cheatsheet.title')}</div>
              <div className="text-[10px] text-muted-foreground">{t('cheatsheet.hint')}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onOpenChange(false)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {groups.map((group) => (
            <div key={group.titleKey} className="space-y-1.5">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t(group.titleKey)}
              </div>
              <div className="rounded-lg border border-border/60 overflow-hidden divide-y divide-border/50">
                {group.rows.map((row) => (
                  <div
                    key={row.combo}
                    className="flex items-center justify-between px-3 py-1.5 bg-card/60 hover:bg-accent/40 transition-colors text-xs"
                  >
                    <span className="text-foreground/85">{t(row.descKey)}</span>
                    <kbd className="px-1.5 py-0.5 rounded-md border border-border/70 bg-muted/50 font-mono text-[10px] text-muted-foreground shrink-0">
                      {row.combo}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
