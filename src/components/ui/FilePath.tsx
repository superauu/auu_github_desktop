/** Give the distinguishing filename priority while retaining the full path. */
export function FilePath({ path }: { path: string }) {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return <span className="min-w-0 flex-1 flex flex-col text-left leading-snug" title={path}>
    <span className="truncate text-[13px] text-foreground">{path.slice(separator + 1)}</span>
    {separator >= 0 && <span className="truncate text-[12px] text-muted-foreground">{path.slice(0, separator)}</span>}
  </span>;
}
