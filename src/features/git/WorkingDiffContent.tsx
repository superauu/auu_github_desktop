import type { Dispatch, SetStateAction, ReactNode } from 'react';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { Button } from '@/components/ui/button';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { highlightDiff } from '@/components/ui/DiffTools';
import { FileCode } from 'lucide-react';
import { ImageDiffView } from './ImageDiffView';
import { isImagePath } from '@/services/git/ImageDiffService';
import type { GitFileChange, GitStatusResult, RepositoryInfo } from '@/services/git/types';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import type { computeSplitRows } from '@/utils/diffRows';
import { useI18n } from '@/i18n';
import { cn } from '@/utils/cn';

interface WorkingDiffContentProps {
  diffId: string; diffFontSize: number; wrap: boolean;
  currentRepo: RepositoryInfo | null; activeFile: GitFileChange | null; status: GitStatusResult | null;
  fileDiffLoading: boolean; fileDiffError: string | null;
  loadFileDiff: (file: GitFileChange) => Promise<void>; fileDiffLines: ParsedDiffLine[];
  diffMode: 'unified' | 'split'; splitRows: ReturnType<typeof computeSplitRows>;
  renderHunkActions: (index: number) => ReactNode; headerHunkIdx: Map<number, number>;
  ignoreWhitespace: boolean; selectedLines: Set<number>; lineBusy: boolean; pendingWrites: number;
  setSelectedLines: Dispatch<SetStateAction<Set<number>>>; diffQuery: string;
}

export function WorkingDiffContent({ diffId, diffFontSize, wrap, currentRepo, activeFile, status, fileDiffLoading, fileDiffError, loadFileDiff, fileDiffLines, diffMode, splitRows, renderHunkActions, headerHunkIdx, ignoreWhitespace, selectedLines, lineBusy, pendingWrites, setSelectedLines, diffQuery }: WorkingDiffContentProps) {
  const { t } = useI18n();
  return (
          <div id={diffId} data-text-context style={{ fontSize: diffFontSize }} className={cn("glass-editor flex-1 overflow-auto font-mono leading-relaxed text-foreground select-text", wrap && "diff-wrap")}>
            {currentRepo && activeFile && isImagePath(activeFile.path) ? <ImageDiffView key={`${activeFile.path}-${activeFile.staged}-${status?.headOid}`} repoPath={currentRepo.path} path={activeFile.path} beforePath={activeFile.oldPath} before={activeFile.status === 'untracked' || (activeFile.staged && activeFile.status === 'added') ? 'EMPTY' : activeFile.staged ? (/^[0-9a-f]{40,64}$/.test(status?.headOid || '') ? status!.headOid! : 'EMPTY') : 'INDEX'} after={activeFile.staged ? 'INDEX' : 'WORKTREE'} /> : fileDiffLoading ? <p role="status" className="p-6 text-muted-foreground">{t('common.loading')}</p> : fileDiffError ? <div role="alert" className="p-6 space-y-3"><ErrorNotice error={fileDiffError} /><Button variant="outline" onClick={() => activeFile && void loadFileDiff(activeFile)}>{t('composer.retry')}</Button></div> : fileDiffLines.length === 0 ? (
              <div className="py-24 text-center space-y-2 text-muted-foreground select-none">
                <FileCode className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <div className="text-xs">
                  {activeFile ? t('changes.emptyDiffUntracked') : t('rightPane.noFileSelectedDesc')}
                </div>
              </div>
            ) : diffMode === 'split' ? (
              /* Split Two-Column View */
              <VirtualRows items={splitRows} rowHeight={24} renderRow={(row, idx) => {
                  if (row.isHeader) {
                    return (
                      <div
                        key={idx}
                        className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[12px] w-full flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{row.headerContent}</span>
                        {renderHunkActions(row.hunkIdx ?? -1)}
                      </div>
                    );
                  }

                  const hasLeft = !!row.left;
                  const hasRight = !!row.right;
                  const isLeftDel = row.left?.type === 'delete';
                  const isRightAdd = row.right?.type === 'add';

                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-2 divide-x divide-border/60 hover:bg-accent/40 dark:hover:bg-white/3 transition-colors"
                    >
                      {/* Left Column (Original / Deletions) */}
                      <div
                        className={cn(
                          "flex items-stretch overflow-hidden min-w-0 border-l-2",
                          isLeftDel
                            ? "diff-line-del font-medium dark:font-normal"
                            : hasLeft
                            ? "border-transparent text-foreground/85"
                            : "border-transparent bg-muted/15 opacity-40 select-none"
                        )}
                      >
                        <div className="w-10 px-2 text-right text-muted-foreground select-none shrink-0 font-mono text-[12px] bg-muted/40 dark:bg-background/20 border-r border-border/40">
                          {row.left?.lineNo ?? ''}
                        </div>
                        <div data-diff-content className="px-2.5 whitespace-pre font-mono flex-1 overflow-x-auto">
                          {highlightDiff(row.left?.content || '', diffQuery)}
                        </div>
                      </div>

                      {/* Right Column (Modified / Additions) */}
                      <div
                        className={cn(
                          "flex items-stretch overflow-hidden min-w-0 border-l-2",
                          isRightAdd
                            ? "diff-line-add font-medium dark:font-normal"
                            : hasRight
                            ? "border-transparent text-foreground/85"
                            : "border-transparent bg-muted/15 opacity-40 select-none"
                        )}
                      >
                        <div className="w-10 px-2 text-right text-muted-foreground select-none shrink-0 font-mono text-[12px] bg-muted/40 dark:bg-background/20 border-r border-border/40">
                          {row.right?.lineNo ?? ''}
                        </div>
                        <div data-diff-content className="px-2.5 whitespace-pre font-mono flex-1 overflow-x-auto">
                          {highlightDiff(row.right?.content || '', diffQuery)}
                        </div>
                      </div>
                    </div>
                  );
                }} />
            ) : (
              /* Unified Single Column View */
              <VirtualRows items={fileDiffLines} contentWidth={!wrap} rowHeight={24} renderRow={(line, idx) => {
                if (line.type === 'header') {
                  return (
                    <div
                      key={idx}
                      className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[12px] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{line.content}</span>
                      {renderHunkActions(headerHunkIdx.get(idx) ?? -1)}
                    </div>
                  );
                }

                const isAdd = line.type === 'add';
                const isDel = line.type === 'delete';

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-stretch hover:bg-accent/40 dark:hover:bg-white/3 transition-colors border-l-2",
                      isAdd
                        ? "diff-line-add font-medium dark:font-normal"
                        : isDel
                        ? "diff-line-del font-medium dark:font-normal"
                        : "border-transparent text-foreground/85"
                    )}
                  >
                    {activeFile?.status === 'modified' && !ignoreWhitespace && <label className="w-7 flex justify-center items-center shrink-0 select-none">{(isAdd || isDel) && <input type="checkbox" aria-label={`${t('flow.selectLine')} ${line.oldNo ?? line.newNo}`} checked={selectedLines.has(idx)} disabled={lineBusy || !!pendingWrites} onChange={e => setSelectedLines(previous => { const next = new Set(previous); if (e.target.checked) next.add(idx); else next.delete(idx); return next; })} />}</label>}
                    {/* Line Numbers */}
                    <div className="w-10 px-2 text-right text-muted-foreground select-none shrink-0 font-mono text-[12px] bg-muted/40 dark:bg-background/20">
                      {line.oldNo ?? ''}
                    </div>
                    <div className="w-10 px-2 text-right text-muted-foreground select-none shrink-0 font-mono text-[12px] border-r border-border/60 dark:border-border/20 bg-muted/40 dark:bg-background/20">
                      {line.newNo ?? ''}
                    </div>
                    {/* Content */}
                    <div data-diff-content className="px-3 whitespace-pre font-mono flex-1">
                      {highlightDiff(line.content, diffQuery)}
                    </div>
                  </div>
                );
              }} />
            )}
          </div>
  );
}
