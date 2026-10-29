/**
 * 本地几何 identicon：由种子（作者邮箱，缺省用名字/hash）确定性生成 5x5 镜像点阵与色相。
 * 离线可用、无网络依赖；色相锁定在品牌安全色板内（炭灰底 + 现有 git 语义色系，禁蓝紫段）。
 */

/** FNV-1a 32 位哈希：比 crypto 简单，散列质量对视觉点阵足够 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 品牌安全色相：青/翡翠/青绿/琥珀/天蓝/玫红——对应 git 语义色系，避开紫段 */
const HUES = [187, 152, 172, 42, 213, 336];

export interface IdenticonSpec {
  hue: number;
  /** 25 格行优先点阵，左右镜像对称 */
  cells: boolean[];
}

export function identiconSpec(seed: string): IdenticonSpec {
  let h = fnv1a(seed && seed.trim() ? seed.trim().toLowerCase() : 'anonymous');
  const cells = new Array<boolean>(25).fill(false);
  let onCount = 0;
  // 只生成左 3 列，右 2 列镜像；每格消费 1 个演化位
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 5; row++) {
      h = Math.imul(h, 0x01000193) >>> 0;
      const on = (h & 0x00800000) !== 0;
      if (on) onCount++;
      cells[row * 5 + col] = on;
      cells[row * 5 + (4 - col)] = on;
    }
  }
  // 防空白点阵：过稀时强制中列点亮，保持「有身份」的视觉密度
  if (onCount < 3) {
    cells[12] = true;
    cells[7] = true;
    cells[17] = true;
  }
  h = Math.imul(h, 0x01000193) >>> 0;
  return { hue: HUES[h % HUES.length], cells };
}
