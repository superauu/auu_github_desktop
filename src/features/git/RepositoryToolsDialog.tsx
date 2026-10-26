import React, { useState } from 'react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import { X } from 'lucide-react';
import { SubmodulesPanel } from './tools/SubmodulesPanel';
import { LfsPanel } from './tools/LfsPanel';
import { SigningPanel } from './tools/SigningPanel';

interface RepositoryToolsDialogProps {
  repoPath: string;
  onClose: () => void;
}

type ToolTab = 'submodules' | 'lfs' | 'signing';

/**
 * 仓库工具弹窗：子模块 / Git LFS / 提交签名三个仓库级工具的统一入口。
 * 面板组件各自独立实现，本壳只负责标签导航。
 */
export const RepositoryToolsDialog: React.FC<RepositoryToolsDialogProps> = ({ repoPath, onClose }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<ToolTab>('submodules');

  const tabs: Array<{ id: ToolTab; label: string }> = [
    { id: 'submodules', label: t('repoTools.tab.submodules') },
    { id: 'lfs', label: t('repoTools.tab.lfs') },
    { id: 'signing', label: t('repoTools.tab.signing') },
  ];

  return (
    <ModalSurface
      onDismiss={onClose}
      dismissible
      label={t('repoTools.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-4 pb-2 border-b border-border">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">{t('repoTools.title')}</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">{t('repoTools.subtitle')}</p>
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-5 border-b border-border" role="tablist" aria-label={t('repoTools.title')}>
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={`px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                tab === entry.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {tab === 'submodules' && <SubmodulesPanel repoPath={repoPath} />}
          {tab === 'lfs' && <LfsPanel repoPath={repoPath} />}
          {tab === 'signing' && <SigningPanel repoPath={repoPath} />}
        </div>
      </div>
    </ModalSurface>
  );
};
