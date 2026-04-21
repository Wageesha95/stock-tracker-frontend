import { useState, useMemo } from 'react';

type SortDir = 'asc' | 'desc';

export function useTableSort<T extends Record<string, any>>(
  items: T[],
  defaultKey: keyof T & string,
  defaultDir: SortDir = 'desc',
  tieBreaker?: (a: T, b: T, sortKey: keyof T & string) => number,
) {
  const [sortKey, setSortKey] = useState<keyof T & string>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      const tb = tieBreaker ? tieBreaker(a, b, sortKey) : 0;
      return sortDir === 'asc' ? tb : -tb;
    });
  }, [items, sortKey, sortDir, tieBreaker]);

  const handleSort = (key: keyof T & string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(typeof items[0]?.[key] === 'string' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (key: keyof T & string) => {
    if (sortKey !== key) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  return { sorted, handleSort, sortIcon };
}
