export function formatPatientName(value: string) {
  return value.split('^').filter(Boolean).reverse().join(' ');
}

export function formatDate(value: string) {
  return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
}

export function formatTime(value: string) {
  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

