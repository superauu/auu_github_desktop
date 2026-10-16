/** Fit persisted preferences around a readable main view without overwriting them. */
export function fitWorkspacePanels(width: number, requested: { left: number; right: number; files: number }, visible: { left: boolean; right: boolean; files: boolean }) {
  const sizes = {
    left: visible.left ? Math.max(160, Math.min(500, requested.left)) : 0,
    right: visible.right ? Math.max(220, Math.min(650, requested.right)) : 0,
    files: visible.files ? Math.max(160, Math.min(500, requested.files)) : 0,
  };
  const handles = Object.values(visible).filter(Boolean).length * 6;
  let excess = sizes.left + sizes.right + sizes.files + handles + 640 - width;
  for (const [panel, minimum] of [['left', 160], ['files', 160], ['right', 220]] as const) {
    if (sizes[panel] && excess > 0) {
      const reduction = Math.min(sizes[panel] - minimum, excess);
      sizes[panel] -= reduction; excess -= reduction;
    }
  }
  return sizes;
}
