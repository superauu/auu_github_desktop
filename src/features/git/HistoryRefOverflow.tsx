import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Cloud, GitBranch, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';

export function historyRefTarget(ref: string): string {
  if (ref.startsWith('tag: ')) return `refs/tags/${ref.slice(5)}`;
  return ref.replace(/^HEAD -> /, '').replace(/^remotes\//, '');
}

export function HistoryRefOverflow({ refs, onLocate }: { refs: string[]; onLocate: (target: string) => void }) {
  const { t } = useI18n();
  if (refs.length <= 2) return null;
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <Button variant="outline" size="xs" className="h-5 shrink-0 rounded-sm px-1 tabular-nums"
        aria-label={t('history.allRefs').replace('{n}', String(refs.length))}
        title={t('history.allRefs').replace('{n}', String(refs.length))}
        onClick={event => event.stopPropagation()}>
        +{refs.length - 2}
      </Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="start" sideOffset={5} className="z-50 w-80 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        onClick={event => event.stopPropagation()}>
        <DropdownMenu.Label className="px-3 py-2 text-[12px] text-muted-foreground">{t('history.allRefs').replace('{n}', String(refs.length))}</DropdownMenu.Label>
        <DropdownMenu.Group>
          {refs.map(ref => {
            const target = historyRefTarget(ref);
            const isTag = ref.startsWith('tag: ');
            const Icon = isTag ? Tag : ref.startsWith('remotes/') || ref.startsWith('origin/') ? Cloud : GitBranch;
            return <DropdownMenu.Item key={ref} className="menu-item" onSelect={() => onLocate(target)} title={ref}>
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="min-w-0 break-all">{isTag ? ref.slice(5) : target}</span>
            </DropdownMenu.Item>;
          })}
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
