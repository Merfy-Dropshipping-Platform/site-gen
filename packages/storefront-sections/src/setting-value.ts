import type { SectionManifest } from './format';

// Тип значения поля по виду (блок 3 «Секций и SDK», раздел 3.8): из той же схемы, что проверка. По нему блок 5 строит
// тип ctx.settings. Элементы settings без ключа setting (ссылки на общие настройки частей 4–5 блока 1) отсеиваются.
type SettingFieldOf = Extract<SectionManifest['settings'][number], { setting: unknown }>;

export type SettingValueOf<K extends SettingFieldOf['setting']['kind']> = Extract<
  SettingFieldOf['setting'],
  { kind: K }
>['default'];
