import React, { useEffect, useState } from 'react';
import {
  Folder,
  HardDrive,
  ChevronRight,
  ArrowUp,
  FolderGit2,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DirectoryEntry,
  listDirectories,
  ListDirsResult,
} from '@/services/fs/DirectoryService';
import { useI18n } from '@/i18n';

interface InAppFolderBrowserProps {
  initialPath?: string;
  onSelectPath: (path: string) => void;
}

export const InAppFolderBrowser: React.FC<InAppFolderBrowserProps> = ({
  initialPath,
  onSelectPath,
}) => {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState<string>(initialPath || '');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDir = async (path?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res: ListDirsResult = await listDirectories(path);
      setCurrentPath(res.currentPath);
      setParentPath(res.parentPath);
      setDirectories(res.directories);
    } catch (err: any) {
      setError(err.message || t('browser.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDir(initialPath);
  }, []);

  return (
    <div className="rounded-xl border border-border/80 bg-background/80 overflow-hidden text-xs flex flex-col max-h-64 animate-in fade-in-50">
      {/* Navigation bar */}
      <div className="px-3 py-2 bg-muted/40 border-b border-border/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {parentPath !== null ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => loadDir(parentPath)}
              title={t('browser.backTitle')}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => loadDir('')}
              title={t('browser.drivesTitle')}
            >
              <HardDrive className="h-3.5 w-3.5" />
            </Button>
          )}

          <span className="font-mono text-[12px] text-foreground truncate select-text">
            {currentPath || t('browser.myComputer')}
          </span>
        </div>

        {currentPath && (
          <Button
            size="xs"
            variant="default"
            className="shrink-0 h-6 px-2 text-[12px] gap-1"
            onClick={() => onSelectPath(currentPath)}
          >
            <Check className="h-3 w-3" />
            <span>{t('browser.selectCurrent')}</span>
          </Button>
        )}
      </div>

      {/* Directory list */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/30 max-h-48 p-1">
        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-[12px]">{t('browser.scanning')}</span>
          </div>
        ) : error ? (
          <div className="py-6 px-4 text-center text-rose-400 text-xs">
            {error}
            <Button
              variant="link"
              size="sm"
              className="block mx-auto text-xs mt-1 text-primary"
              onClick={() => loadDir('')}
            >
              {t('browser.backToRoot')}
            </Button>
          </div>
        ) : directories.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-xs">
            {t('browser.noSubfolders')}
          </div>
        ) : (
          directories.map((dir) => (
            <div
              key={dir.path}
              className="px-2.5 py-1.5 flex items-center justify-between rounded hover:bg-accent/50 cursor-pointer group transition-colors"
              onClick={() => loadDir(dir.path)}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {dir.hasGit ? (
                  <FolderGit2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                ) : !currentPath ? (
                  <HardDrive className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                ) : (
                  <Folder className="h-3.5 w-3.5 text-amber-400/80 shrink-0" />
                )}
                <span className="font-medium text-foreground text-[12px] truncate group-hover:text-primary transition-colors">
                  {dir.name}
                </span>
                {dir.hasGit && (
                  <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                    {t('browser.gitRepo')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPath(dir.path);
                  }}
                >
                  选择
                </Button>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
