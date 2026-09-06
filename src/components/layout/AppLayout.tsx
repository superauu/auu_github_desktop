import React, { useState } from 'react';
import { Header } from './Header';
import { LeftSidebar } from './LeftSidebar';
import { CenterStage } from './CenterStage';
import { RightPane } from './RightPane';
import { StatusBar } from './StatusBar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { RepositoryDialog } from '@/features/repository/RepositoryDialog';
import { GitHubAuthDialog } from '@/components/github/GitHubAuthDialog';

export const AppLayout: React.FC = () => {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [repoDialogMode, setRepoDialogMode] = useState<'open' | 'clone' | 'init'>('open');
  const [githubAuthOpen, setGithubAuthOpen] = useState(false);

  const handleOpenRepoDialog = (mode: 'open' | 'clone' | 'init' = 'open') => {
    setRepoDialogMode(mode);
    setRepoDialogOpen(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground select-none font-sans">
      {/* Top Header & Action Toolbar */}
      <Header
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenRepoDialog={() => handleOpenRepoDialog('open')}
        onOpenGitHubAuth={() => setGithubAuthOpen(true)}
      />

      {/* Main 3-Column Work Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <LeftSidebar />
        <CenterStage
          onOpenRepoDialog={() => handleOpenRepoDialog('open')}
          onCloneRepoDialog={() => handleOpenRepoDialog('clone')}
          onInitRepoDialog={() => handleOpenRepoDialog('init')}
          onOpenGitHubAuth={() => setGithubAuthOpen(true)}
        />
        <RightPane />
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />

      {/* Global Modals & Dialogs */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenRepoDialog={() => handleOpenRepoDialog('open')}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <RepositoryDialog
        open={repoDialogOpen}
        onOpenChange={setRepoDialogOpen}
        initialMode={repoDialogMode}
      />

      <GitHubAuthDialog
        open={githubAuthOpen}
        onOpenChange={setGithubAuthOpen}
      />
    </div>
  );
};

