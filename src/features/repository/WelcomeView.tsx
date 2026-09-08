import React from 'react';
import {
  FolderOpen,
  FolderGit2,
  GitFork,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';

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
  const { recentRepos, setCurrentRepo } = useRepoStore();

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center p-6 select-none overflow-y-auto">
      <div className="max-w-xl w-full space-y-8 animate-in fade-in-50 duration-300">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-b from-sky-500/10 to-transparent border border-sky-500/20 glow-primary mb-1">
            <img src="/logo.svg" alt="Auu Git" className="h-10 w-10 drop-shadow-md" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Auu Git Desktop
          </h1>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            轻量、现代、美观、极速的桌面 Git 客户端与 GitHub 开发者仪表盘。
          </p>
        </div>

        {/* Primary Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={onOpenRepo}
            className="group p-4 rounded-xl border border-border bg-card/40 hover:bg-accent/40 hover:border-primary/40 transition-all text-left flex flex-col justify-between h-32 relative overflow-hidden"
          >
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 w-fit group-hover:scale-105 transition-transform">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                打开本地仓库
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                浏览并载入已有项目
              </div>
            </div>
          </button>

          <button
            onClick={onCloneRepo}
            className="group p-4 rounded-xl border border-border bg-card/40 hover:bg-accent/40 hover:border-primary/40 transition-all text-left flex flex-col justify-between h-32 relative overflow-hidden"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 w-fit group-hover:scale-105 transition-transform">
              <GitFork className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                克隆远程仓库
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                从 GitHub 或 URL 克隆
              </div>
            </div>
          </button>

          <button
            onClick={onInitRepo}
            className="group p-4 rounded-xl border border-border bg-card/40 hover:bg-accent/40 hover:border-primary/40 transition-all text-left flex flex-col justify-between h-32 relative overflow-hidden"
          >
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 w-fit group-hover:scale-105 transition-transform">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                新建本地仓库
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                初始化全新 Git 仓库
              </div>
            </div>
          </button>
        </div>

        {/* Recent Repositories Section */}
        {recentRepos.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>最近使用的项目</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/30 divide-y divide-border/60 overflow-hidden shadow-sm">
              {recentRepos.map((repo) => (
                <div
                  key={repo.path}
                  onClick={() => setCurrentRepo(repo)}
                  className="p-3 flex items-center justify-between hover:bg-accent/40 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FolderGit2 className="h-4 w-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                    <div className="min-w-0">
                      <div className="font-medium text-xs text-foreground group-hover:text-primary transition-colors truncate">
                        {repo.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate font-mono">
                        {repo.path}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-accent/60 font-mono">
                      {repo.currentBranch}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
