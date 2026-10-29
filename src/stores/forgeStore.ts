import { create } from 'zustand';
import { gitService } from '@/services/git/GitService';
import { parseForgeRemote } from '@/services/forge/remoteIdentity';
import type { ForgePipeline, ForgePullRequest, ForgePullRequestDetail, ForgeUser } from '@/services/forge/types';
import { gitlabService } from '@/services/gitlab/GitLabService';
import { giteaService } from '@/services/gitea/GiteaService';

/**
 * 多平台托管状态：GitLab / Gitea 账号（PAT + 服务器）与当前仓库的平台识别。
 *
 * 凭据：token 走桌面 keyring 槽位（store_forge_token，service 白名单在 Rust 层）；
 * dev（浏览器）回落内存 Map。服务器地址与用户名是非敏感信息，存 localStorage。
 * GitHub 不走本 store——既有 githubStore 的深度能力保持不动。
 */
const STORAGE_KEY = 'auu_git_forge_accounts';
const DEV_TOKENS = new Map<string, string>();

interface PersistedAccount {
  server: string;
  user: ForgeUser | null;
}

interface ForgeStoreState {
  gitlab: PersistedAccount | null;
  gitea: PersistedAccount | null;
  /** 当前仓库识别到的 forge（github 仓库不进入本状态，沿用既有界面）。 */
  detection: { kind: 'gitlab' | 'gitea'; server: string; ownerPath: string; repo: string } | null;
  pulls: ForgePullRequest[];
  pullsLoading: boolean;
  pullsError: string;
  pipelines: ForgePipeline[];
  pipelinesLoading: boolean;

  /** 启动时恢复已保存账号（token 失效不阻塞，使用时报 401 再重连）。 */
  restoreAccounts(): Promise<void>;
  connect(kind: 'gitlab' | 'gitea', server: string, token: string): Promise<ForgeUser>;
  disconnect(kind: 'gitlab' | 'gitea'): Promise<void>;
  /** 识别当前仓库的 origin：gitlab.com / 已连接服务器域名命中 → 进入 forge 界面。 */
  detect(repoPath: string): Promise<void>;
  /** 离开 forge 上下文（无仓库/视图卸载/断开账号）时清空瞬态数据，并作废在途加载。 */
  resetTransient(): void;
  loadPulls(): Promise<void>;
  loadDetail(number: number): Promise<ForgePullRequestDetail>;
  loadPipelines(ref?: string): Promise<void>;
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invokeKeyring<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

async function readToken(kind: string): Promise<string | null> {
  if (!isTauri()) return DEV_TOKENS.get(kind) ?? null;
  try {
    return await invokeKeyring<string | null>('get_forge_token', { service: kind, profileId: null });
  } catch {
    return null;
  }
}

async function writeToken(kind: string, token: string | null): Promise<void> {
  if (!isTauri()) {
    if (token) DEV_TOKENS.set(kind, token);
    else DEV_TOKENS.delete(kind);
    return;
  }
  await invokeKeyring('store_forge_token', { token: token ?? '', service: kind, profileId: null });
}

function readPersisted(): { gitlab: PersistedAccount | null; gitea: PersistedAccount | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { gitlab: null, gitea: null };
    const parsed = JSON.parse(raw) as { gitlab?: PersistedAccount | null; gitea?: PersistedAccount | null };
    return { gitlab: parsed.gitlab ?? null, gitea: parsed.gitea ?? null };
  } catch {
    return { gitlab: null, gitea: null };
  }
}

function persist(state: Pick<ForgeStoreState, 'gitlab' | 'gitea'>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gitlab: state.gitlab, gitea: state.gitea }));
  } catch {
    /* 存储不可用时静默：token 仍在 keyring，重连即可 */
  }
}

const hostOf = (server: string): string => {
  try {
    return new URL(server).host.toLowerCase();
  } catch {
    return server.trim().toLowerCase();
  }
};

export const useForgeStore = create<ForgeStoreState>((set, get) => {
  // 竞态代币（范式同 githubStore 的 ticket）：仓库切换/离开上下文使代数 +1，
  // 之前仓库的在途加载返回后按代数作废——慢请求不得把 A 仓库的 PR/流水线挂到 B 仓库下。
  let loadGeneration = 0;
  const ticket = () => {
    const epoch = loadGeneration;
    return () => loadGeneration === epoch;
  };
  return {
  gitlab: null,
  gitea: null,
  detection: null,
  pulls: [],
  pullsLoading: false,
  pullsError: '',
  pipelines: [],
  pipelinesLoading: false,

  async restoreAccounts() {
    const saved = readPersisted();
    const token = await readToken('gitlab');
    if (saved.gitlab && token) {
      gitlabService.configure(token, saved.gitlab.server);
      set({ gitlab: saved.gitlab });
    }
    const giteaToken = await readToken('gitea');
    if (saved.gitea && giteaToken) {
      giteaService.configure(giteaToken, saved.gitea.server);
      set({ gitea: saved.gitea });
    }
  },

  async connect(kind, server, token) {
    const normalized = server.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(normalized)) throw new Error('Server URL must start with http:// or https://');
    const service = kind === 'gitlab' ? gitlabService : giteaService;
    service.configure(token.trim(), normalized);
    const user = await service.verifyToken();
    await writeToken(kind, token.trim());
    const account: PersistedAccount = { server: normalized, user };
    set(kind === 'gitlab' ? { gitlab: account } : { gitea: account });
    persist(get());
    return user;
  },

  async disconnect(kind) {
    await writeToken(kind, null).catch(() => {});
    set(kind === 'gitlab' ? { gitlab: null } : { gitea: null });
    persist(get());
    if (get().detection?.kind === kind) get().resetTransient();
  },

  async detect(repoPath) {
    get().resetTransient();
    const origin = await gitService.getOriginUrl(repoPath).catch(() => undefined);
    if (!origin) return;
    const remote = parseForgeRemote(origin);
    if (!remote) return;
    if (remote.kind === 'gitlab' || remote.host === hostOf(get().gitlab?.server ?? '')) {
      set({ detection: { kind: 'gitlab', server: get().gitlab?.server || 'https://gitlab.com', ownerPath: remote.ownerPath, repo: remote.repo } });
      return;
    }
    const gitea = get().gitea;
    if (gitea && remote.host === hostOf(gitea.server)) {
      set({ detection: { kind: 'gitea', server: gitea.server, ownerPath: remote.ownerPath, repo: remote.repo } });
    }
  },

  resetTransient() {
    loadGeneration++;
    set({ detection: null, pulls: [], pullsError: '', pipelines: [], pullsLoading: false, pipelinesLoading: false });
  },

  async loadPulls() {
    const { detection } = get();
    if (!detection || get().pullsLoading) return;
    const valid = ticket();
    set({ pullsLoading: true, pullsError: '' });
    try {
      if (detection.kind === 'gitlab') {
        const projectId = await gitlabService.projectId(detection.ownerPath, detection.repo);
        const pulls = await gitlabService.listPullRequests(projectId, 'opened');
        if (valid()) set({ pulls });
      } else {
        const [owner] = detection.ownerPath.split('/');
        const pulls = await giteaService.listPullRequests(owner, detection.repo, 'open');
        if (valid()) set({ pulls });
      }
    } catch (error) {
      if (valid()) set({ pulls: [], pullsError: error instanceof Error ? error.message : String(error) });
    } finally {
      if (valid()) set({ pullsLoading: false });
    }
  },

  async loadDetail(number) {
    const { detection } = get();
    if (!detection) throw new Error('No forge detected');
    if (detection.kind === 'gitlab') {
      const projectId = await gitlabService.projectId(detection.ownerPath, detection.repo);
      return gitlabService.getPullRequest(projectId, number);
    }
    const [owner] = detection.ownerPath.split('/');
    return giteaService.getPullRequest(owner, detection.repo, number);
  },

  async loadPipelines(ref) {
    const { detection } = get();
    if (!detection || get().pipelinesLoading) return;
    const valid = ticket();
    set({ pipelinesLoading: true });
    try {
      if (detection.kind === 'gitlab') {
        const projectId = await gitlabService.projectId(detection.ownerPath, detection.repo);
        const pipelines = await gitlabService.listPipelines(projectId, ref);
        if (valid()) set({ pipelines });
      } else {
        const [owner] = detection.ownerPath.split('/');
        const pipelines = await giteaService.listPipelines(owner, detection.repo, ref || 'HEAD');
        if (valid()) set({ pipelines });
      }
    } catch {
      if (valid()) set({ pipelines: [] });
    } finally {
      if (valid()) set({ pipelinesLoading: false });
    }
  },
  };
});
