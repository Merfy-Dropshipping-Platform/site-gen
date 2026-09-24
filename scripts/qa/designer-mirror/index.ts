/**
 * Зеркала главных верстальщиков: та же последовательность секций и то же
 * содержимое, что на <тема>.merfy.ru, в пропсах НАШИХ секций. Настройки,
 * которых у верстальщиков нет, не задаются — действуют наши значения по
 * умолчанию (их и проверяет цель).
 */
export type MirrorSection = {
  /** Имя клетки в отчёте. */
  name: string;
  /** Наши секции, склеенные в одну полосу (промо + шапка — одна полоса у верстальщиков). */
  blocks: string[];
  /** Пропсы по блоку — содержимое верстальщиков. */
  props: Record<string, Record<string, unknown>>;
  /** Номер полосы на главной верстальщиков (0 — шапка). */
  refIndex: number;
};

export type Mirror = {
  refUrl: string;
  /** Живой CSS витрины этой темы: шрифты и общие правила. */
  liveCss: string;
  /** База для относительных адресов (фото, шрифты). */
  assetBase: string;
  catalog: { products: unknown[]; collections: unknown[]; publications: unknown[] };
  sections: MirrorSection[];
  /**
   * Клетки, которые не закрыть без нарушения правил (у нас по канону больше
   * элементов, другое поле панели и т.п.). Клетка остаётся красной — решает
   * владелец; причина здесь, чтобы отчёт её не терял.
   */
  known?: { section: string; reason: string }[];
};

import { bloom } from "./bloom";
import { flux } from "./flux";
import { satin } from "./satin";

export const MIRRORS: Record<string, Mirror> = { bloom, flux, satin };
