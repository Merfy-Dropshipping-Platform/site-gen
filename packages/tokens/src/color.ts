export const WHITE = '#ffffff';
export const BLACK = '#000000';
// Порог читаемости — WCAG AA для обычного текста; то же число, что у нынешних тем (READABLE_CR в tokens-css.ts).
export const READABLE = 4.5;

const CHANNEL_OFFSETS = [1, 3, 5];
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722];
const MAX_CHANNEL = 255;
const LINEAR_EDGE = 0.04045;
const CONTRAST_OFFSET = 0.05;

export function channelsOf(hex: string): number[] {
  return CHANNEL_OFFSETS.map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

export function toHex(channels: readonly number[]): string {
  const pairs = channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0'));
  return `#${pairs.join('')}`;
}

// Смесь двух цветов: weight — доля первого цвета, от 0 до 1.
export function mixHex(first: string, second: string, weight: number): string {
  const secondChannels = channelsOf(second);
  const mixed = channelsOf(first).map((channel, index) => channel * weight + secondChannels[index] * (1 - weight));
  return toHex(mixed);
}

function linear(channel: number): number {
  const share = channel / MAX_CHANNEL;
  return share <= LINEAR_EDGE ? share / 12.92 : Math.pow((share + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  return channelsOf(hex).reduce((sum, channel, index) => sum + LUMINANCE_WEIGHTS[index] * linear(channel), 0);
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + CONTRAST_OFFSET) / (Math.min(a, b) + CONTRAST_OFFSET);
}
