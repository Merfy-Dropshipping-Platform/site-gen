/**
 * Legacy themeSettings.colorSchemes seed — what every new site was stamped
 * with before 079-themes-figma-parity. Used by the back-fill migration to
 * distinguish "merchant never customised" from "merchant deliberately
 * edited". DO NOT edit once shipped — changing the snapshot would cause
 * previously-migrated sites to look un-migrated on the next run.
 *
 * Captured 2026-04-21 from site `214dd73c-0f5d-4913-b72f-a25ed5bcd976`
 * (theme_id = rose). The same structure was stamped onto vanilla / bloom /
 * satin / flux sites regardless of their theme, which is precisely why this
 * back-fill is necessary.
 */

export interface MerchantButtonScheme {
  text: string;
  border: string;
  textHover: string;
  background: string;
  backgroundHover: string;
}

export interface MerchantColorScheme {
  id: string;
  name: string;
  text: string;
  heading: string;
  surfaceBg: string;
  background: string;
  primaryButton: MerchantButtonScheme;
  secondaryButton: MerchantButtonScheme;
}

export const LEGACY_SEED_SCHEMES: MerchantColorScheme[] = [
  {
    id: 'scheme-1',
    name: 'Схема 1',
    text: '#FFFFFF',
    heading: '#FFFFFF',
    surfaceBg: '#1A1A1A',
    background: '#000000',
    primaryButton: {
      text: '#000000',
      border: '#FFFFFF',
      textHover: '#000000',
      background: '#FFFFFF',
      backgroundHover: '#F5F5F5',
    },
    secondaryButton: {
      text: '#FFFFFF',
      border: '#FFFFFF',
      textHover: '#FFFFFF',
      background: '#000000',
      backgroundHover: '#1A1A1A',
    },
  },
  {
    id: 'scheme-2',
    name: 'Схема 2',
    text: '#000000',
    heading: '#000000',
    surfaceBg: '#FBFBFB',
    background: '#FFFFFF',
    primaryButton: {
      text: '#FFFFFF',
      border: '#000000',
      textHover: '#FFFFFF',
      background: '#000000',
      backgroundHover: '#1A1A1A',
    },
    secondaryButton: {
      text: '#000000',
      border: '#000000',
      textHover: '#000000',
      background: '#FFFFFF',
      backgroundHover: '#F5F5F5',
    },
  },
  {
    id: 'scheme-3',
    name: 'Схема 3',
    text: '#FFFFFF',
    heading: '#FFFFFF',
    surfaceBg: '#5AAFFF',
    background: '#71C0FF',
    primaryButton: {
      text: '#71C0FF',
      border: '#FFFFFF',
      textHover: '#5AAFFF',
      background: '#FFFFFF',
      backgroundHover: '#F5F5F5',
    },
    secondaryButton: {
      text: '#71C0FF',
      border: '#E8F5FF',
      textHover: '#5AAFFF',
      background: '#E8F5FF',
      backgroundHover: '#D6ECFF',
    },
  },
  {
    id: 'scheme-4',
    name: 'Схема 4',
    text: '#1A1A1A',
    heading: '#1A1A1A',
    surfaceBg: '#EBE5DE',
    background: '#F5F0EB',
    primaryButton: {
      text: '#FFFFFF',
      border: '#000000',
      textHover: '#FFFFFF',
      background: '#000000',
      backgroundHover: '#1A1A1A',
    },
    secondaryButton: {
      text: '#1A1A1A',
      border: '#1A1A1A',
      textHover: '#1A1A1A',
      background: '#F5F0EB',
      backgroundHover: '#EBE5DE',
    },
  },
  {
    id: 'scheme-5',
    name: 'Схема 5',
    text: '#F5F0EB',
    heading: '#FFFFFF',
    surfaceBg: '#2A2A2A',
    background: '#1A1A1A',
    primaryButton: {
      text: '#1A1A1A',
      border: '#F5F0EB',
      textHover: '#1A1A1A',
      background: '#F5F0EB',
      backgroundHover: '#EBE5DE',
    },
    secondaryButton: {
      text: '#F5F0EB',
      border: '#F5F0EB',
      textHover: '#F5F0EB',
      background: '#1A1A1A',
      backgroundHover: '#2A2A2A',
    },
  },
];

export function isLegacySeed(candidate: unknown): boolean {
  if (!Array.isArray(candidate) || candidate.length !== LEGACY_SEED_SCHEMES.length) {
    return false;
  }
  return JSON.stringify(candidate) === JSON.stringify(LEGACY_SEED_SCHEMES);
}
