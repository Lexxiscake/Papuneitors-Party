// Lista fija de los papuneitors.
// Se puede votar por cualquiera de ellos aunque no esté en la sala ni tenga cuenta.
export const LINEUP: readonly string[] = [
  "Luka",
  "Jacobo",
  "Capitan Pineda",
  "Cesar",
  "Dilan",
  "Gustavo",
  "Manuel",
  "Melani",
  "Neto",
  "Zeus",
  "Jovany",
  "Alejandro",
  "David",
  "Edgar",
  "Elian",
  "Joel",
  "Samuel",
  "Jocelyn",
  "Andres",
  "Jason",
];

/** Minúsculas y sin tildes, para comparar y buscar sin exigir la grafía exacta. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Devuelve los nombres de la lista que coinciden con lo escrito. */
export function searchLineup(term: string): string[] {
  const q = normalizeName(term);
  if (!q) return [...LINEUP];
  return LINEUP.filter((name) => normalizeName(name).includes(q));
}

export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}
