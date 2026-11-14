export function formatNutrient(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'sin dato';
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value) + ' g';
}

export function shortFoodName(name: string): string {
  const displayNames: Record<string, string> = {
    'Aceite de girasol con menos de 60 % de ácido linoleico': 'Aceite de girasol · linoleico <60 %',
    'Aceite de girasol con aproximadamente 65 % de ácido linoleico':
      'Aceite de girasol · linoleico ≈65 %',
  };
  const compact = (displayNames[name] ?? name).replace(/\s*\([^)]*\)/g, '').trim();
  if (compact.length <= 44) return compact;
  const words = compact.split(/\s+/);
  let first = '';
  while (words.length && first.length + (words[0]?.length ?? 0) < 25)
    first += (first ? ' ' : '') + words.shift();
  let last = '';
  while (words.length && last.length + (words.at(-1)?.length ?? 0) < 17)
    last = words.pop() + (last ? ' ' + last : '');
  return first + '…' + (last ? ' ' + last : '');
}
