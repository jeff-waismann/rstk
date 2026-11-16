/**
 * Integer-cents currency formatting & parsing utilities (no floating-point math).
 */

export function formatBRL(cents) {
  const safe = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(safe / 100);
}

export function centsToInput(cents) {
  const safe = Math.max(0, Math.round(Number(cents) || 0));
  const whole = Math.floor(safe / 100);
  const rem = String(safe % 100).padStart(2, '0');
  return `${whole},${rem}`;
}

export function inputToCents(raw) {
  const str = String(raw || '').trim().replace(/[R$\s.]/g, '').replace(',', '.');
  if (!str) return 0;
  const parts = str.split('.');
  const intPart = parseInt(parts[0].replace(/\D/g, '') || '0', 10);
  const decRaw = (parts[1] || '').replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
  const decPart = parseInt(decRaw || '0', 10);
  return intPart * 100 + decPart;
}
