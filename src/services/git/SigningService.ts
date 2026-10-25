import { executeGit, GitExecutionError } from './GitExecutor';
import { tNow } from '@/i18n';

/**
 * SSH 提交签名服务层。
 *
 * 仓库配置读写全部走 executeGit（config 白名单已放行 user.signingkey、
 * commit/tag.gpgsign 恰为 true/false、gpg.format 恰为 ssh；gpg.program /
 * gpg.ssh.* 在纯层被永久拒绝）。SSH 密钥的列举与生成是桌面专属命令
 * （Rust ssh_signing.rs：私钥永不出后端），dev 模式下抛错由面板降级为手动输入。
 */
export interface SigningStatus {
  /** user.signingkey 的当前值（公钥路径或字面公钥）；未配置为空串。 */
  signingKey: string;
  /** commit.gpgsign 当前是否为 true。 */
  commitSign: boolean;
  /** gpg.format 当前值；未配置为空串。 */
  format: string;
}

export interface SshPublicKeyInfo {
  name: string;
  path: string;
  content: string;
  fingerprint: string;
}

const isDesktopRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktopRuntime()) {
    throw new Error('SSH key commands are only available in the desktop app');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

async function readConfig(repoPath: string, key: string): Promise<string> {
  try {
    return (await executeGit(['config', '--local', '--get', key], repoPath)).stdout.trim();
  } catch (error) {
    if (error instanceof GitExecutionError) return '';
    throw error;
  }
}

class SigningService {
  /** 读取本仓库签名三件套配置。 */
  async status(repoPath: string): Promise<SigningStatus> {
    const [signingKey, commitSign, format] = await Promise.all([
      readConfig(repoPath, 'user.signingkey'),
      readConfig(repoPath, 'commit.gpgsign'),
      readConfig(repoPath, 'gpg.format'),
    ]);
    return { signingKey, commitSign: commitSign === 'true', format };
  }

  /**
   * 启用签名：gpg.format=ssh + user.signingkey=<key> + commit.gpgsign=true。
   * key 为空且当前也未配置 signingkey 时拒绝（git 会用 gpg 默认程序签，偏离 SSH 语义）。
   */
  async enable(repoPath: string, key: string): Promise<void> {
    const trimmed = key.trim();
    const current = trimmed || (await this.status(repoPath)).signingKey;
    if (!current) throw new Error(tNow('signing.noKey'));
    await executeGit(['config', '--local', 'gpg.format', 'ssh'], repoPath);
    if (trimmed) {
      await executeGit(['config', '--local', 'user.signingkey', trimmed], repoPath);
    }
    await executeGit(['config', '--local', 'commit.gpgsign', 'true'], repoPath);
  }

  /** 停用签名：仅把 commit.gpgsign 置 false（保留密钥配置，便于再次启用）。 */
  async disable(repoPath: string): Promise<void> {
    await executeGit(['config', '--local', 'commit.gpgsign', 'false'], repoPath);
  }

  /** 桌面端：探测 ssh-keygen（PATH 遍历 + 系统兜底，不经 shell）；缺失返回 null。 */
  detectKeygen(): Promise<string | null> {
    return invokeDesktop<string | null>('detect_ssh_keygen');
  }

  /** 桌面端：列举 ~/.ssh/*.pub 公钥（含指纹）；私钥内容永不出后端。 */
  listPublicKeys(): Promise<SshPublicKeyInfo[]> {
    return invokeDesktop<SshPublicKeyInfo[]>('list_ssh_public_keys');
  }

  /** 桌面端：生成无口令 ed25519 密钥对（存在性前置检查，防 ssh-keygen 交互挂起）。 */
  generateKey(name: string, comment: string): Promise<SshPublicKeyInfo> {
    return invokeDesktop<SshPublicKeyInfo>('generate_ssh_signing_key', { name, comment });
  }
}

export const signingService = new SigningService();
