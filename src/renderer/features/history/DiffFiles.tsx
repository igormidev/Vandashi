import { ChevronDown, FileCode2 } from 'lucide-react';
import type { FileChange } from '../../../domain/models';

function displayPaths(files: FileChange[]): string[] {
  if (!files.length || files.some((file) => !/^(?:\/|[a-z]:[\\/]|\\\\)/i.test(file.path)))
    return files.map((file) => file.path);
  const parts = files.map((file) => file.path.split(/[\\/]/));
  const first = parts[0];
  if (!first) return [];
  let common = 0;
  while (parts.every((path) => common < path.length - 1 && path[common] === first[common])) common++;
  return parts.map((path) => path.slice(common).join('/'));
}
export function DiffFiles({ files }: { files: FileChange[] }) {
  const paths = displayPaths(files);
  return (
    <div className="diff-files">
      {files.map((file, index) => (
        <details key={file.path}>
          <summary>
            <FileCode2 size={13} />
            <span title={file.path}>{paths[index]}</span>
            <span className="diff-plus">{`+${String(file.additions)}`}</span>
            <span className="diff-minus">{`−${String(file.deletions)}`}</span>
            <ChevronDown size={12} className="diff-expand" />
          </summary>
          <pre>
            {file.diff.split('\n').map((line, index) => (
              <div
                key={index}
                className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : ''}
              >
                {line || ' '}
              </div>
            ))}
          </pre>
        </details>
      ))}
    </div>
  );
}
