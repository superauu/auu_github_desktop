import { Fragment } from 'react';
import { cn } from '@/utils/cn';

/** 只增加显示样式,不改变原始文本、缩进或换行。报告仅高亮四空格缩进的代码片段。 */
export function ReviewDiffText({ text, report = false }: { text: string; report?: boolean }) {
  return text.split('\n').map((line, index, lines) => {
    const code = report ? line.startsWith('    ') ? line.slice(4) : null : line;
    return (
      <Fragment key={index}>
        <span className={cn(
          'inline-block min-w-full min-h-[1.5em] align-top px-2 border-l-2',
          code?.startsWith('@@ ') ? 'diff-line-header border-l-transparent'
            : code?.startsWith('+') ? 'diff-line-add'
              : code?.startsWith('-') ? 'diff-line-del'
                : 'border-transparent text-foreground/85',
          report && line.startsWith('## ') && 'font-semibold text-foreground',
        )}>{line}</span>{index < lines.length - 1 ? '\n' : ''}
      </Fragment>
    );
  });
}
