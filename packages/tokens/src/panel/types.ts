// Схема панели темы (design.md блока 8, П1 и П8-4 Б): группы и поля нынешней панели «Настройки темы». Поле ссылается
// ровно на одно — на токен словаря (token) или на настройку своего типа (setting). Только типы, кода нет.

// Как панель рисует поле токена. Какой вид токена подходит какому полю — CONTROL_KINDS в panel.ts.
export type TokenControl = 'color' | 'slider' | 'font' | 'weight' | 'segment' | 'align' | 'scheme';
export type PanelOption = { value: string; label: string };
export type SliderRange = { min: number; max: number; step: number };
export type SettingValue = string | boolean;
// Поле видно, только когда настройка равна значению: «Цветовая схема» корзины — при виде «Сайдбар».
export type VisibleWhen = { setting: string; equals: SettingValue };

type FieldBase = {
  id: string;
  label: string;
  sublabel?: string;
  // Подзаголовок внутри группы: «Основная кнопка», «Дополнительная кнопка».
  section?: string;
  // Поля с одним row стоят в одной строке под подписью первого: шрифт и насыщенность.
  row?: string;
  visibleWhen?: VisibleWhen;
};

export type TokenField = FieldBase & {
  token: string;
  control: TokenControl;
  range?: SliderRange;
  options?: PanelOption[];
};

// Настройки не про вид (П8-4 Б): картинка, ссылка, строка, текст, выбор, переключатель. Умолчание — в схеме платформы.
export type SettingSpec =
  | { kind: 'image'; default: string; maxBytes: number }
  | { kind: 'url'; default: string; placeholder?: string }
  | { kind: 'string'; default: string }
  | { kind: 'text'; default: string }
  | { kind: 'select'; default: string; options: PanelOption[] }
  | { kind: 'toggle'; default: boolean; labels: { on: string; off: string } };
export type SettingKind = SettingSpec['kind'];

export type SettingField = FieldBase & {
  setting: SettingSpec;
  // Выбор рисуется кнопками в ряд, а не выпадающим списком: «Сайдбар / Страница».
  control?: 'segment';
};

export type PanelField = TokenField | SettingField;
// Правый сайдбар группы: баннер cookie — заголовок, текст, кнопки, расположение.
export type PanelSidebar = { title: string; fields: PanelField[] };
export type PanelGroup = {
  id: string;
  title: string;
  // schemes — группа цветов: образцы схем, по нажатию — форма полей одной схемы.
  layout?: 'schemes';
  fields: PanelField[];
  sidebar?: PanelSidebar;
};
export type PanelSchema = { v: 1; groups: PanelGroup[] };

// Правки настроек в ревизии: только изменённые, плоско, по id поля.
export type SettingsEdits = Record<string, SettingValue>;
