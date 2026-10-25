import { keyboardRowProps } from '@/utils/keyboardNavigation';
import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import {
  FolderOpen,
  FolderGit2,
  GitFork,
  Clock,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';

interface WelcomeViewProps {
  onOpenRepo: () => void;
  onCloneRepo: () => void;
  onInitRepo: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onOpenRepo,
  onCloneRepo,
  onInitRepo,
}) => {
  const { recentRepos, setCurrentRepo } = useRepoStore(useShallow(state => ({ recentRepos: state.recentRepos, setCurrentRepo: state.setCurrentRepo })));
  const { t } = useI18n();

  return (
    <div className="glass-surface glass-stage flex-1 min-w-0 h-full flex flex-col items-center justify-center p-6 select-none overflow-y-auto relative">
      <div className="max-w-xl w-full space-y-8 animate-in fade-in-50 duration-300 relative z-10">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center mb-1">
            <img src="/logo.svg" alt="AuuGit" className="h-20 w-20" />
          </div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-[0.12em] text-foreground dark:text-glow-cyan">
            {t('welcome.title')}
          </h1>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {t('welcome.tagline')}
          </p>
          <div className="hidden sm:flex items-center justify-center gap-2 text-[11px] font-mono text-muted-foreground/70 tracking-wider">
            <Terminal className="h-3 w-3 text-primary/70" />
            <span>&gt; git init --neon</span>
            <span className="inline-block h-3 w-[6px] bg-primary/80 neon-breathe" aria-hidden />
          </div>
        </div>

        {/* Primary Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={onOpenRepo}
            className="group p-4 rounded-xl border border-border bg-card/40 hover:bg-accent/40 hover:border-primary/50 dark:hover:border-cyan-300/50 dark:hover:shadow-[0_0_18px_rgba(0,229,255,0.18)] transition-all text-left flex flex-col justify-between h-32 relative overflow-hidden cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500 dark:text-cyan-300 w-fit transition-transform">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                {t('welcome.openRepo')}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {t('welcome.openRepoDesc')}
              </div>
            </div>
            <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-cyan-400 dark:bg-cyan-300 group-hover:w-full transition-all duration-300" aria-hidden />
          </button>

          <button
            onClick={onCloneRepo}
            className="group p-4 rounded-xl border border-border bg-card/40 hover:bg-accent/40 hover:border-primary/50 dark:hover:border-cyan-300/50 dark:hover:shadow-[0_0_18px_rgba(0,229,255,0.18)] transition-all text-left flex flex-col justify-between h-32 relative overflow-hidden cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-neon-pink/10 text-neon-pink dark:text-neon-pink/90 w-fit transition-transform">
              <GitFork className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                {t('welcome.cloneRepo')}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {t('welcome.cloneRepoDesc')}
              </div>
            </div>
            <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-neon-pink group-hover:w-full transition-all duration-300" aria-hidden />
          </button>

          <button
            onClick={onInitRepo}
            className="group p-4 rounded-xl border border-border bg-card/40 hover:bg-accent/40 hover:border-primary/50 dark:hover:border-cyan-300/50 dark:hover:shadow-[0_0_18px_rgba(0,229,255,0.18)] transition-all text-left flex flex-col justify-between h-32 relative overflow-hidden cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-neon-green w-fit transition-transform">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                {t('welcome.initRepo')}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {t('welcome.initRepoDesc')}
              </div>
            </div>
            <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-emerald-400 to-cyan-400 group-hover:w-full transition-all duration-300" aria-hidden />
          </button>
        </div>

        {/* Recent Repositories Section */}
        {recentRepos.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{t('welcome.recent')}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/30 divide-y divide-border/60 overflow-hidden shadow-sm" role="list" data-keyboard-list>
              {recentRepos.map((repo) => (
                <div
                  key={repo.path}
                  {...keyboardRowProps(`${repo.name} ${repo.path}`)}
                  onClick={() => setCurrentRepo(repo)}
                  className="p-3 flex items-center justify-between hover:bg-accent/40 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FolderGit2 className="h-4 w-4 text-primary shrink-0 transition-transform" />
                    <div className="min-w-0">
                      <div className="font-medium text-xs text-foreground group-hover:text-primary transition-colors truncate">
                        {repo.name}
                      </div>
                      <div className="text-[12px] text-muted-foreground truncate font-mono">
                        {repo.path}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-accent/60 font-mono">
                      {repo.currentBranch}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
