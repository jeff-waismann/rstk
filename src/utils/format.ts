export interface VinylAlbum {
  id: number;
  artist: string;
  title: string;
  sourceTitle: string;
  units: number;
  media: string;
  date: string;
  genre: string;
  cover: string;
  coverUrl?: string;
  source?: string;
  priceCents: number;
  stock?: number;
  active: boolean;
  featuredHero: boolean;
  sortOrder: number;
}

export interface SiteSettings {
  brandName: string;
  brandAlt: string;
  logoUrl: string;
  headerTagline: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  launchLabel: string;
  priceCents: number;
  validityText: string;
  validityDate: string;
  heroCaption: string;
  heroFeaturedIds: number[];
  browseTitle: string;
  browseSubtitle: string;
  whatsappNumber: string;
  whatsappDefaultMessage: string;
  detailNote: string;
  footerTextPrimary: string;
  footerTextSecondary: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  siteUrl: string;
}

/**
 * Formats integer cents to Brazilian Real currency string (e.g., 18999 -> "R$ 189,99").
 */
export function formatPriceBRL(cents: number): string {
  const value = Number.isFinite(cents) ? cents / 100 : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

/**
 * Formats YYYY-MM-DD to pt-BR date string (DD/MM/YYYY).
 */
export function formatDateBR(isoDate: string): string {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('pt-BR');
}

/**
 * Formats units count to Portuguese vinyl format description.
 * 1 -> "Álbum Simples", 2 -> "Álbum Duplo", N -> "N LPs".
 */
export function formatAlbumUnits(units: number | string | undefined): string {
  const n = Number(units) || 1;
  if (n === 1) return 'Álbum Simples';
  if (n === 2) return 'Álbum Duplo';
  return `${n} LPs`;
}
