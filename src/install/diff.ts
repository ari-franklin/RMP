function lines(value: string): string[] {
  const result = value.split('\n');
  if (result.at(-1) === '') result.pop();
  return result;
}

function lineAt(values: string[], index: number): string {
  const value = values[index];
  if (value === undefined) throw new Error('Diff line index is out of bounds');
  return value;
}

function lengthAt(lengths: number[][], left: number, right: number): number {
  return lengths[left]?.[right] ?? 0;
}

export function unifiedDiff(path: string, current: string | undefined, proposed: string): string {
  const before = lines(current ?? '');
  const after = lines(proposed);
  const lengths = Array.from({ length: before.length + 1 }, () =>
    Array<number>(after.length + 1).fill(0),
  );

  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      const row = lengths[left];
      if (row === undefined) throw new Error('Diff matrix row is missing');
      row[right] =
        lineAt(before, left) === lineAt(after, right)
          ? lengthAt(lengths, left + 1, right + 1) + 1
          : Math.max(lengthAt(lengths, left + 1, right), lengthAt(lengths, left, right + 1));
    }
  }

  const body: string[] = [];
  let left = 0;
  let right = 0;
  while (left < before.length && right < after.length) {
    const beforeLine = lineAt(before, left);
    const afterLine = lineAt(after, right);
    if (beforeLine === afterLine) {
      body.push(` ${beforeLine}`);
      left += 1;
      right += 1;
    } else if (lengthAt(lengths, left + 1, right) >= lengthAt(lengths, left, right + 1)) {
      body.push(`-${beforeLine}`);
      left += 1;
    } else {
      body.push(`+${afterLine}`);
      right += 1;
    }
  }
  while (left < before.length) {
    body.push(`-${lineAt(before, left)}`);
    left += 1;
  }
  while (right < after.length) {
    body.push(`+${lineAt(after, right)}`);
    right += 1;
  }

  return [`--- ${current === undefined ? '/dev/null' : path}`, `+++ ${path}`, ...body, ''].join(
    '\n',
  );
}
