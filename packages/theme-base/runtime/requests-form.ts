/**
 * requests-form — рантайм «Формы заявки» для витрины (спека 118, T013a+T013b).
 *
 * ЧТО ЭТО. Чистые функции рендера/валидации (T013a): visibleFields (условия
 * показа полей), validate (тексты ошибок мокапа — один в один из прототипа
 * scratchpad/zayavki-screens/prototype.js, submitSite), renderFormHTML
 * (sf-разметка мокапа: sfForm/sfField → строка HTML, включая состояние
 * файлов и ошибок). Плюс mountRequestsForm (T013b) — обвязка острова на
 * странице товара: дескриптор из fn-канала расширения `requests`
 * (POST /store/extensions/requests/fn/productForm), события, файлы
 * (blob-превью + загрузка POST /store/requests-files), отправка
 * POST /store/extensions/requests/fn/submit, экран «Заявка №N отправлена».
 *
 * ФОРМАТ ДЕСКРИПТОРА — спека 118 §6 / @merfy/forms (T006): 10 типов полей
 * (text, textarea, select, buttons, checkbox, date, number, photo, video,
 * file), условие показа `cond {f, v}`, лимиты (len/max/min/maxDays),
 * телефон `phone: 'req'|'opt'|'off'`, кнопка `btn`, сообщение `done`.
 *
 * ПОЧЕМУ ОБЫЧНЫЕ function-ДЕКЛАРАЦИИ (не стрелки). Как и в
 * runtime/extension-points.ts (паттерн EXTENSION_POINTS_RUNTIME_SOURCE):
 * блоки theme-base гидрируются только через `<script is:inline
 * set:html={…}>`, поэтому рантайм собран в строку REQUESTS_FORM_RUNTIME_SOURCE
 * из `.toString()` РОВНО тех же деклараций, что экспортированы ниже и
 * покрыты тестами (`__tests__/requests-form.test.ts` и
 * `__tests__/requests-form.dom.test.ts` импортируют функции напрямую).
 * Один текст — и на витрине, и в проверке. Все объявления —
 * `function name(…)`, чтобы при конкатенации поднимались (hoisting) в общую
 * область видимости инжектированного скрипта; тела функций не ссылаются на
 * модульные константы — только на другие function-декларации из этого же
 * набора (в т.ч. лимиты файлов — через requestMediaInfo, не FILE_LIMITS).
 *
 * КОНТРАКТЫ ЭНДПОИНТОВ (fn-канал расширения `requests`, спека §3:
 * POST /store/extensions/:id/fn/:name?store_id= — см.
 * api-gateway extension-fn.controller.ts; метод всегда POST, тело —
 * JSON-объект input, ответ {success, data}):
 *   POST /store/extensions/requests/fn/productForm?store_id= {productId} →
 *       {success, data: дескриптор | null} — null = форма не назначена,
 *       корзина как была;
 *   POST /store/requests-files?store_id= — multipart, поле `file`, по одному
 *       файлу на запрос → {success, data: {key, url, name, size, mime}}
 *       (загрузка файлов идёт напрямую через sites/S3, НЕ через fn-канал);
 *   POST /store/extensions/requests/fn/submit?store_id=
 *       {productId, values, contacts, files:[мета]} → {success, data: {id, …}}.
 *
 * НЕ ЗДЕСЬ: страницы «Мои заявки» (T014), серверные лимиты (дата ≥ minDays,
 * число min/max) — их проверяет @merfy/forms на сервере (T002); у мокапа нет
 * своих текстов для них, здесь они не придумываются.
 */

/** 10 типов полей дескриптора @merfy/forms (спека §6). */
export type RequestFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'buttons'
  | 'checkbox'
  | 'date'
  | 'number'
  | 'photo'
  | 'video'
  | 'file';

export interface RequestFieldDescriptor {
  id: string;
  type: RequestFieldType;
  label: string;
  /** Подсказка покупателю под полем. */
  hint?: string;
  /** Обязательное поле (сервер проверяет тоже — спека §2). */
  req?: boolean;
  /** Варианты для select/buttons. */
  opts?: string[];
  /** Условие показа: поле видно, когда values[cond.f] === cond.v. */
  cond?: { f: string; v: string };
  /** Лимит символов для text/textarea. */
  len?: number;
  /** Сколько файлов можно приложить (photo/video/file). */
  max?: number;
  /** Минимум/максимум для number. */
  min?: number;
  /** Дата: не раньше чем через N дней от сегодня. */
  minDays?: number;
}

export interface RequestFormDescriptor {
  id?: string;
  name?: string;
  /** Текст кнопки отправки (и заголовка формы). */
  btn?: string;
  /** Сообщение после отправки. */
  done?: string;
  /** Режим телефона в контактах: обязателен / необязателен / не спрашивать. */
  phone?: 'req' | 'opt' | 'off';
  fields?: RequestFieldDescriptor[];
}

/** Контакты покупателя — фиксированный блок формы (спека §6, «contactsOf»). */
export interface RequestFormContacts {
  name?: string;
  email?: string;
  phone?: string;
  /** Согласие на обработку персональных данных. */
  consent?: boolean;
}

/** Ключи ошибок контактов — совпадают с data-sf-хуками разметки sf-*. */
export const REQUEST_CONTACT_KEYS = {
  name: '_name',
  email: '_email',
  phone: '_phone',
  consent: '_ok',
} as const;

/**
 * Лимиты файлов мокапа (спека §7) — те же значения, что FILE_LIMITS пакета
 * @merfy/forms (T006): когда пакет появится, заменить импортом. Инлайн-строка
 * рантайма читает их через requestMediaInfo — НЕ через этот объект.
 */
export const FILE_LIMITS: Record<
  'photo' | 'video' | 'file',
  { maxMb: number; accept: string; fmt: string; unit: string }
> = {
  photo: {
    maxMb: 20,
    accept: 'image/*',
    fmt: 'JPEG, PNG или HEIC до 20 МБ',
    unit: 'фото',
  },
  video: {
    maxMb: 500,
    accept: 'video/mp4,video/quicktime,video/*',
    fmt: 'MP4 или MOV до 500 МБ',
    unit: 'видео',
  },
  file: {
    maxMb: 50,
    accept: '.pdf,.zip,application/pdf,application/zip',
    fmt: 'PDF или ZIP до 50 МБ',
    unit: 'файл',
  },
};

/** @deprecated использовать FILE_LIMITS (имя пакета @merfy/forms). */
export const REQUEST_FILE_LIMITS = FILE_LIMITS;

/**
 * Клиентский вид файла поля-файла: до ответа сервера — blob-превью
 * (uploading), после — мета загрузки (key/url/name из ответа).
 */
export interface RequestFileView {
  name: string;
  /** «3,4 МБ» — подпись в списке. */
  size?: string;
  /** Точный размер в байтах (уходит в fn/submit). */
  bytes?: number;
  /** blob:-превью или url загруженного файла. */
  url?: string;
  heic?: boolean;
  /** Загрузка идёт (кнопка отправки ждёт). */
  uploading?: boolean;
  /** Загрузка не удалась (эндпоинт недоступен) — файл не попадёт в заявку. */
  failed?: boolean;
  /** Ключ MinIO из ответа /store/requests-files — файл попал в заявку. */
  key?: string;
  mime?: string;
  /** Сам File (живёт только в mountRequestsForm, в рендер не идёт). */
  file?: unknown;
}

/** `&`/`<`/`>`/`"`/`'` → сущности — весь текст дескриптора идёт в innerHTML. */
export function escapeRequestHtml(raw: unknown): string {
  const s = raw === undefined || raw === null ? '' : String(raw);
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** photo/video/file — поля-файлы (значение — список файлов, не строка). */
export function isRequestMediaField(type: string): boolean {
  return type === 'photo' || type === 'video' || type === 'file';
}

/** Параметры поля-файла (accept, подпись формата, слово «фото/видео/файл»). */
export function requestMediaInfo(type: string): {
  accept: string;
  fmt: string;
  unit: string;
  maxMb: number;
} {
  if (type === 'photo')
    return {
      accept: 'image/*',
      fmt: 'JPEG, PNG или HEIC до 20 МБ',
      unit: 'фото',
      maxMb: 20,
    };
  if (type === 'video')
    return {
      accept: 'video/mp4,video/quicktime,video/*',
      fmt: 'MP4 или MOV до 500 МБ',
      unit: 'видео',
      maxMb: 500,
    };
  return {
    accept: '.pdf,.zip,application/pdf,application/zip',
    fmt: 'PDF или ZIP до 50 МБ',
    unit: 'файл',
    maxMb: 50,
  };
}

/** min для type=date: сегодня + minDays дней, ISO yyyy-mm-dd (мокап, minDate). */
export function requestMinDateISO(days: unknown): string {
  const d = new Date();
  d.setDate(d.getDate() + (typeof days === 'number' ? days : 0));
  return d.toISOString().slice(0, 10);
}

/** Байты → «3,4 МБ» (мокап, fileAdd). */
export function requestFormatFileSize(bytes: unknown): string {
  const n = typeof bytes === 'number' && isFinite(bytes) ? bytes : 0;
  return (n / 1048576).toFixed(1).replace('.', ',') + ' МБ';
}

/**
 * Поля, видимые при данных значениях: без cond — всегда; с cond — когда
 * значение поля-условия совпадает (мокап, visible()). Дескриптор-мусор
 * трактуется как форма без полей.
 */
export function visibleFields(
  descriptor: RequestFormDescriptor | null | undefined,
  values: Record<string, unknown> | null | undefined,
): RequestFieldDescriptor[] {
  const src: unknown[] =
    descriptor && typeof descriptor === 'object' && Array.isArray(descriptor.fields)
      ? (descriptor.fields as unknown[])
      : [];
  const vals = values || {};
  return src.filter((f) => {
    if (!f || typeof f !== 'object') return false;
    const field = f as RequestFieldDescriptor;
    if (!field.cond) return true;
    return vals[field.cond.f] === field.cond.v;
  }) as RequestFieldDescriptor[];
}

/**
 * Валидация формы (клиентская — та же, что в мокапе, submitSite). Возвращает
 * карту ошибок: ключ = id поля или контактный ключ ('_name'/'_email'/'_phone'/
 * '_ok' — как data-sf в разметке), значение = текст ошибки мокапа.
 *
 * Проверяется только ВИДИМОЕ (visibleFields): скрытое условием обязательное
 * поле ошибкой не становится. filesCounts — количество выбранных файлов по
 * id поля-файла (сам файл-объект рантайму валидации не нужен).
 *
 * Тексты — один в один из прототипа; серверная валидация @merfy/forms (T002)
 * добавляет лимиты (дата ≥ minDays, число min/max, длина) со своими текстами.
 */
export function validate(
  descriptor: RequestFormDescriptor | null | undefined,
  values: Record<string, unknown> | null | undefined,
  contacts: RequestFormContacts | null | undefined,
  filesCounts: Record<string, number> | null | undefined,
): Record<string, string> {
  const err: Record<string, string> = {};
  const vals = values || {};
  const counts = filesCounts || {};
  const c = contacts || {};

  visibleFields(descriptor, vals).forEach((f) => {
    if (!f || !f.req) return;
    if (isRequestMediaField(f.type)) {
      if (!(counts[f.id] > 0)) {
        err[f.id] =
          f.type === 'photo'
            ? 'Добавьте хотя бы одно фото'
            : f.type === 'video'
              ? 'Добавьте видео'
              : 'Добавьте файл';
      }
      return;
    }
    if (f.type === 'checkbox') {
      if (!vals[f.id]) err[f.id] = 'Отметьте, чтобы продолжить';
      return;
    }
    const v = vals[f.id];
    if (v === undefined || v === null || !String(v).trim()) {
      err[f.id] =
        f.type === 'select' || f.type === 'buttons'
          ? 'Выберите вариант'
          : 'Заполните поле';
    }
  });

  if (!(c.name || '').trim()) err._name = 'Как к вам обращаться?';
  if (!/^\S+@\S+\.\S+$/.test(c.email || ''))
    err._email = 'Нужна почта: сюда придёт ответ магазина';
  const phoneMode = descriptor && descriptor.phone;
  if (phoneMode === 'req' && !(c.phone || '').trim())
    err._phone = 'Нужен телефон';
  if (!c.consent) err._ok = 'Без согласия магазин не сможет принять заявку';

  return err;
}

/** SVG-иконка поля-файла в квадратике .sf-up .ic (мокап, tIcon). */
export function requestFieldIconSvg(type: string): string {
  const paths: Record<string, string> = {
    photo:
      '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-5 4 4 2.5-2.5L20 18"/>',
    video:
      '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>',
    file: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4"/>',
  };
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (paths[type] || paths.file) +
    '</svg>'
  );
}

/** Разметка списка выбранных файлов поля (мокап: sf-thumbs/sf-vids + data-sfdel). */
export function requestFilesHTML(
  f: RequestFieldDescriptor,
  files: RequestFileView[] | null | undefined,
): string {
  const list = files || [];
  if (!list.length) return '';
  if (f.type === 'photo') {
    const show = list.slice(0, 23);
    return (
      '<div class="sf-thumbs">' +
      show
        .map((x, i) => {
          const inner = x.heic
            ? '<span class="more">HEIC</span>'
            : '<img alt="" src="' + escapeRequestHtml(x.url) + '">';
          return (
            '<div>' +
            inner +
            '<button type="button" data-sfdel="' +
            escapeRequestHtml(f.id) +
            '|' +
            i +
            '" aria-label="Убрать ' +
            escapeRequestHtml(x.name) +
            '">×</button></div>'
          );
        })
        .join('') +
      (list.length > 23 ? '<div class="more">+' + (list.length - 23) + '</div>' : '') +
      '</div>'
    );
  }
  return (
    '<div class="sf-vids">' +
    list
      .map((x, i) => {
        const status = x.uploading
          ? ' · загрузка…'
          : x.failed
            ? ' · не загрузился'
            : '';
        return (
          '<div class="sf-vid"><i aria-hidden="true">' +
          (f.type === 'video' ? '▶' : 'PDF') +
          '</i><span>' +
          escapeRequestHtml(x.name) +
          '</span><small>' +
          escapeRequestHtml(x.size) +
          status +
          '</small><button type="button" data-sfdel="' +
          escapeRequestHtml(f.id) +
          '|' +
          i +
          '" aria-label="Убрать ' +
          escapeRequestHtml(x.name) +
          '">×</button></div>'
        );
      })
      .join('') +
    '</div>'
  );
}

/**
 * Разметка одного поля — порт sfField мокапа + состояние файлов/ошибок
 * (T013b). values — текущие значения, files/…[f.id] — выбранные файлы,
 * errors/…[f.id] — текст ошибки (класс bad, aria-invalid, sf-e под полем).
 * Хуки для событий: data-sf (значение), data-sfbtn (кнопки-варианты
 * «fieldId|option»), data-sfile (файл-инпут), data-sfdel («fieldId|index»).
 * idPrefix изолирует id при нескольких формах на странице.
 */
export function requestFieldHTML(
  f: RequestFieldDescriptor,
  values: Record<string, unknown> | null | undefined,
  idPrefix: string,
  files?: RequestFileView[] | null,
  errors?: Record<string, string> | null,
): string {
  const vals = values || {};
  const v = vals[f.id];
  const id = (idPrefix || 'sf-rq') + '-' + f.id;
  const e = errors ? errors[f.id] : '';
  const bad = e ? ' bad' : '';
  const aria = e
    ? ' aria-invalid="true" aria-describedby="' + id + '-e"'
    : '';
  const errHtml = e
    ? '<p class="sf-e" id="' + id + '-e">' + escapeRequestHtml(e) + '</p>'
    : '';
  const lab =
    '<div class="sf-l"><label for="' +
    id +
    '">' +
    escapeRequestHtml(f.label) +
    '</label><span class="sf-q">' +
    (f.req ? 'обязательно' : 'необязательно') +
    '</span></div>';
  const hint = f.hint ? '<p class="sf-h">' + escapeRequestHtml(f.hint) + '</p>' : '';

  if (f.type === 'checkbox') {
    return (
      '<div class="sf-f"><label class="sf-chk" for="' +
      id +
      '"><input type="checkbox" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '"' +
      (v ? ' checked' : '') +
      '><span>' +
      escapeRequestHtml(f.label) +
      (f.req ? '' : ' · необязательно') +
      '</span></label>' +
      hint +
      errHtml +
      '</div>'
    );
  }

  let inp = '';
  if (f.type === 'text') {
    const max = f.len || 200;
    inp =
      '<input class="sf-in' +
      bad +
      '" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '" maxlength="' +
      max +
      '" value="' +
      escapeRequestHtml(v) +
      '" autocomplete="off"' +
      aria +
      '><p class="sf-h">' +
      (v ? String(v).length : 0) +
      ' из ' +
      max +
      '</p>';
  } else if (f.type === 'textarea') {
    inp =
      '<textarea class="sf-in' +
      bad +
      '" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '" maxlength="' +
      (f.len || 1000) +
      '"' +
      aria +
      '>' +
      escapeRequestHtml(v) +
      '</textarea>';
  } else if (f.type === 'select') {
    inp =
      '<select class="sf-in' +
      bad +
      '" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '"' +
      aria +
      '><option value="">Выберите</option>' +
      (f.opts || [])
        .map(
          (o) =>
            '<option' +
            (v === o ? ' selected' : '') +
            '>' +
            escapeRequestHtml(o) +
            '</option>',
        )
        .join('') +
      '</select>';
  } else if (f.type === 'buttons') {
    inp =
      '<div class="sf-btns" role="radiogroup" aria-labelledby="' +
      id +
      '-g">' +
      (f.opts || [])
        .map(
          (o) =>
            '<button type="button" role="radio" aria-checked="' +
            (v === o) +
            '" class="' +
            (v === o ? 'on' : '') +
            '" data-sfbtn="' +
            escapeRequestHtml(f.id) +
            '|' +
            escapeRequestHtml(o) +
            '">' +
            escapeRequestHtml(o) +
            '</button>',
        )
        .join('') +
      '</div>';
  } else if (f.type === 'date') {
    inp =
      '<input type="date" class="sf-in' +
      bad +
      '" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '" min="' +
      requestMinDateISO(f.minDays) +
      '" value="' +
      escapeRequestHtml(v) +
      '"' +
      aria +
      '>';
  } else if (f.type === 'number') {
    inp =
      '<input type="number" class="sf-in' +
      bad +
      '" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '" inputmode="numeric" value="' +
      escapeRequestHtml(v) +
      '"' +
      (f.min !== undefined && f.min !== null ? ' min="' + f.min + '"' : '') +
      (f.max !== undefined && f.max !== null ? ' max="' + f.max + '"' : '') +
      aria +
      '>';
  } else if (isRequestMediaField(f.type)) {
    const mm = requestMediaInfo(f.type);
    const maxCount = f.max || 1;
    const list = files || [];
    inp =
      '<label class="sf-up' +
      bad +
      '" for="' +
      id +
      '"><input type="file" id="' +
      id +
      '" data-sfile="' +
      escapeRequestHtml(f.id) +
      '" accept="' +
      mm.accept +
      '"' +
      (maxCount > 1 ? ' multiple' : '') +
      '><span class="ic" aria-hidden="true">' +
      requestFieldIconSvg(f.type) +
      '</span><span class="tx"><span>' +
      (list.length ? 'Добавить ещё' : 'Выбрать ' + (f.type === 'photo' ? 'фото' : f.type === 'video' ? 'видео' : 'файл')) +
      '</span><small>' +
      mm.fmt +
      ' · до ' +
      maxCount +
      ' ' +
      (f.type === 'photo' ? 'фото' : f.type === 'video' ? 'видео' : 'файлов') +
      (list.length ? ' · выбрано ' + list.length : '') +
      '</small></span></label>' +
      requestFilesHTML(f, list);
  }

  // Кнопкам-вариантам label нужен отдельным блоком (label for на группу
  // кнопок не вешается) — как в мокапе, через span aria-labelledby.
  const labelRow =
    f.type === 'buttons'
      ? '<div class="sf-l"><span id="' + id + '-g">' + escapeRequestHtml(f.label) + '</span><span class="sf-q">' + (f.req ? 'обязательно' : 'необязательно') + '</span></div>'
      : lab;
  return (
    '<div class="sf-f"' +
    (f.type === 'buttons' ? ' role="group"' : '') +
    '>' +
    labelRow +
    inp +
    hint +
    errHtml +
    '</div>'
  );
}

/** Контактное поле (имя/почта/телефон) — порт helper'а c() мокапа + ошибки. */
export function requestContactHTML(
  key: string,
  label: string,
  type: string,
  reqLabel: string,
  value: unknown,
  idPrefix: string,
  placeholder?: string,
  error?: string,
): string {
  const id = (idPrefix || 'sf-rq') + '-' + key;
  const bad = error ? ' bad' : '';
  const aria = error
    ? ' aria-invalid="true" aria-describedby="' + id + '-e"'
    : '';
  const errHtml = error
    ? '<p class="sf-e" id="' + id + '-e">' + escapeRequestHtml(error) + '</p>'
    : '';
  return (
    '<div class="sf-f"><div class="sf-l"><label for="' +
    id +
    '">' +
    label +
    '</label><span class="sf-q">' +
    reqLabel +
    '</span></div><input class="sf-in' +
    bad +
    '" id="' +
    id +
    '" data-sf="' +
    key +
    '" type="' +
    type +
    '" value="' +
    escapeRequestHtml(value) +
    '"' +
    (placeholder ? ' placeholder="' + placeholder + '"' : '') +
    ' autocomplete="' +
    (key === '_email' ? 'email' : key === '_phone' ? 'tel' : 'name') +
    '"' +
    aria +
    '>' +
    errHtml +
    '</div>'
  );
}

/** Опции рендера формы (T013b): файлы, ошибки, сообщение-статус над формой. */
export interface RenderFormOptions {
  files?: Record<string, RequestFileView[]> | null;
  errors?: Record<string, string> | null;
  /** Сообщение над формой (ошибки сети/загрузки) — sf-e с role="alert". */
  note?: string;
}

/**
 * Полная sf-разметка формы — порт sfForm мокапа: заголовок-кнопка (btn),
 * видимые поля (values влияет и на условия показа), контакты («Как с вами
 * связаться»: имя + почта, телефон по режиму descriptor.phone), согласие,
 * кнопка отправки (data-request-submit), примечание. Стили —
 * RequestFormSfStyles (контейнер .rq-sf).
 */
export function renderFormHTML(
  descriptor: RequestFormDescriptor | null | undefined,
  values?: Record<string, unknown> | null,
  opts?: RenderFormOptions | null,
): string {
  const d = descriptor && typeof descriptor === 'object' ? descriptor : {};
  const vals = values || {};
  const o = opts || {};
  const prefix = 'sf-rq';
  const btn = d.btn || 'Оставить заявку';
  const phone = d.phone;
  const errors = o.errors || {};

  const fields = visibleFields(d, vals)
    .map((f) =>
      requestFieldHTML(f, vals, prefix, o.files ? o.files[f.id] : null, errors),
    )
    .join('');

  const contacts =
    '<div class="sf-sec">Как с вами связаться</div><div class="sf-two">' +
    requestContactHTML(
      '_name',
      'Имя',
      'text',
      'обязательно',
      vals._name,
      prefix,
      undefined,
      errors._name,
    ) +
    requestContactHTML(
      '_email',
      'Почта',
      'email',
      'сюда придёт ответ',
      vals._email,
      prefix,
      'name@mail.ru',
      errors._email,
    ) +
    '</div>' +
    (phone === 'off'
      ? ''
      : requestContactHTML(
          '_phone',
          'Телефон',
          'tel',
          phone === 'req' ? 'обязательно' : 'если удобнее позвонить',
          vals._phone,
          prefix,
          '+7',
          errors._phone,
        ));

  const consent =
    '<div class="sf-f"><label class="sf-chk" for="' +
    prefix +
    '-_ok"><input type="checkbox" id="' +
    prefix +
    '-_ok" data-sf="_ok"' +
    (vals._ok ? ' checked' : '') +
    '><span>Согласна(сен) на обработку персональных данных и файлов по политике магазина</span></label>' +
    (errors._ok
      ? '<p class="sf-e">' + escapeRequestHtml(errors._ok) + '</p>'
      : '') +
    '</div>';

  const note = o.note
    ? '<p class="sf-e" data-request-note role="alert">' +
      escapeRequestHtml(o.note) +
      '</p>'
    : '';

  const submit =
    '<button type="button" class="sf-sub" data-request-submit>' +
    escapeRequestHtml(btn) +
    '</button><p class="sf-note">Ответ придёт на почту и в «Мои заявки». Платить сейчас не нужно.</p>';

  return (
    note +
    '<div class="sf"><div class="sf-box"><h4>' +
    escapeRequestHtml(btn) +
    '</h4>' +
    fields +
    contacts +
    consent +
    submit +
    '</div></div>'
  );
}

/** Экран успеха после отправки (мокап, site-ok) — sf-стиль, без отдельного CSS. */
export function requestSuccessHTML(
  descriptor: RequestFormDescriptor | null | undefined,
  requestNo: unknown,
  email?: string,
): string {
  const d = descriptor && typeof descriptor === 'object' ? descriptor : {};
  const done = d.done || 'Спасибо! Мы посмотрим заявку и ответим.';
  return (
    '<div class="sf"><div class="sf-box" data-request-success role="status"><h4>Заявка №' +
    escapeRequestHtml(requestNo) +
    ' отправлена</h4><p class="sf-h">' +
    escapeRequestHtml(done) +
    ' Ответ придёт на ' +
    escapeRequestHtml(email || 'почту') +
    ' и в «Мои заявки».</p>' +
    '<button type="button" class="sf-sub" data-request-again>Отправить ещё одну</button></div></div>'
  );
}

/**
 * Остров формы на странице товара (T013b). `rootEl` — корень БЛОКА
 * (window.__merfyRoot(blockId), правило Spec 102): внутри ищет контейнер
 * `[data-request-form]` и действия товара `[data-product-actions]`.
 *
 * Поведение: дескриптор из fn/productForm → null/ошибка = тихо ничего (корзина как была);
 * дескриптор есть → форма отрисована, действия товара скрыты (hidden).
 * События — делегированные на контейнер формы; перерисовка — как в мокапе
 * (select/checkbox/кнопки-варианты перерисовывают форму, текст — точечный
 * счётчик). Файлы: blob-превью сразу, загрузка POST /store/requests-files
 * по одному (мета из ответа); эндпоинт недоступен → note «Загрузка файлов
 * временно недоступна», файл не попадёт в заявку. Отправка: validate →
 * скролл к первой ошибке → POST fn/submit → «Заявка №N отправлена».
 */
export function mountRequestsForm(
  rootEl: HTMLElement | null | undefined,
  opts: {
    productId: string;
    apiBase?: string;
    storeId?: string;
  },
): Promise<void> {
  if (!rootEl || !opts || !opts.productId) return Promise.resolve();
  const root = rootEl;
  const found = root.querySelector('[data-request-form]');
  if (!found) return Promise.resolve();
  // Сужение для вложенных function-деклараций (TS не несёт null-check в замыкания).
  const formEl = found as HTMLElement;

  const w =
    typeof window !== 'undefined'
      ? (window as unknown as Record<string, any>)
      : ({} as Record<string, any>);
  const apiBase =
    opts.apiBase ||
    (w.__MERFY_CONFIG__ && w.__MERFY_CONFIG__.apiUrl) ||
    'https://gateway.merfy.ru/api';
  const storeId =
    opts.storeId ||
    (w.__MERFY_CONFIG__ && (w.__MERFY_CONFIG__.shopId || w.__MERFY_CONFIG__.storeId)) ||
    '';
  const productId = opts.productId;

  let descriptor: RequestFormDescriptor | null = null;
  const values: Record<string, unknown> = {};
  const files: Record<string, RequestFileView[]> = {};
  let errors: Record<string, string> = {};
  let note = '';

  function fieldById(fid: string): RequestFieldDescriptor | null {
    const fields = (descriptor && descriptor.fields) || [];
    for (let i = 0; i < fields.length; i++) {
      if (fields[i] && fields[i].id === fid) return fields[i];
    }
    return null;
  }

  function contacts(): RequestFormContacts {
    return {
      name: typeof values._name === 'string' ? values._name : undefined,
      email: typeof values._email === 'string' ? values._email : undefined,
      phone: typeof values._phone === 'string' ? values._phone : undefined,
      consent: !!values._ok,
    };
  }

  function filesCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    Object.keys(files).forEach((fid) => {
      counts[fid] = (files[fid] || []).filter((x) => !x.failed).length;
    });
    return counts;
  }

  function uploadedFileMetas(): Array<Record<string, unknown>> {
    const metas: Array<Record<string, unknown>> = [];
    Object.keys(files).forEach((fid) => {
      (files[fid] || []).forEach((x) => {
        if (x.key)
          metas.push({
            fieldId: fid,
            key: x.key,
            url: x.url,
            name: x.name,
            size: x.bytes,
            mime: x.mime,
          });
      });
    });
    return metas;
  }

  function anyUploading(): boolean {
    let busy = false;
    Object.keys(files).forEach((fid) => {
      (files[fid] || []).forEach((x) => {
        if (x.uploading) busy = true;
      });
    });
    return busy;
  }

  function rerender(): void {
    if (!descriptor) return;
    formEl.innerHTML = renderFormHTML(descriptor, values, {
      files,
      errors,
      note,
    });
  }

  function focusFirstError(): void {
    const first = formEl.querySelector('.bad, .sf-e');
    if (!first) return;
    try {
      first.scrollIntoView({ block: 'center' });
    } catch {
      /* jsdom/старые браузеры — просто фокус ниже */
    }
    const wrap = first.closest('.sf-f');
    const input: HTMLElement | null = wrap
      ? wrap.querySelector('input,textarea,select,button')
      : null;
    if (input && typeof input.focus === 'function') {
      input.focus();
    }
  }

  function uploadEntry(
    f: RequestFieldDescriptor,
    entry: RequestFileView,
  ): void {
    const file = entry.file as File | null;
    if (!file || typeof FormData === 'undefined') {
      entry.uploading = false;
      entry.failed = true;
      note = 'Загрузка файлов временно недоступна';
      rerender();
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fetch(
      apiBase +
        '/store/requests-files?store_id=' +
        encodeURIComponent(storeId),
      { method: 'POST', body: fd, credentials: 'omit' },
    )
      .then((r) => (r && r.ok ? r.json() : null))
      .then((json: { success?: boolean; data?: Record<string, unknown> } | null) => {
        const d = json && json.success ? json.data : null;
        entry.uploading = false;
        if (d && d.key) {
          entry.key = String(d.key);
          entry.url = (d.url as string) || entry.url;
          entry.name = (d.name as string) || entry.name;
          entry.mime = d.mime as string;
        } else {
          entry.failed = true;
          note = 'Загрузка файлов временно недоступна';
        }
        rerender();
      })
      .catch(() => {
        entry.uploading = false;
        entry.failed = true;
        note = 'Загрузка файлов временно недоступна';
        rerender();
      });
  }

  function fileAdd(fid: string, list: ArrayLike<File>): void {
    const f = fieldById(fid);
    if (!f || !isRequestMediaField(f.type)) return;
    const mm = requestMediaInfo(f.type);
    const arr = files[fid] || (files[fid] = []);
    const maxCount = f.max || 1;
    let skipped = 0;
    let big = 0;
    Array.prototype.forEach.call(list, (file: File) => {
      if (arr.length >= maxCount) {
        skipped++;
        return;
      }
      const okType =
        f.type === 'photo'
          ? /^image\//.test(file.type) || /\.heic$/i.test(file.name)
          : f.type === 'video'
            ? /^video\//.test(file.type)
            : /\.(pdf|zip)$/i.test(file.name);
      if (!okType) {
        skipped++;
        return;
      }
      if (file.size > mm.maxMb * 1048576) {
        big++;
        return;
      }
      const heic = /heic|heif/i.test(file.type) || /\.heic$/i.test(file.name);
      const entry: RequestFileView = {
        name: file.name,
        size: requestFormatFileSize(file.size),
        bytes: file.size,
        url:
          typeof URL !== 'undefined' && URL.createObjectURL
            ? URL.createObjectURL(file)
            : undefined,
        heic,
        uploading: true,
        file,
      };
      arr.push(entry);
      uploadEntry(f, entry);
    });
    delete errors[fid];
    note =
      big > 0
        ? 'Файлы больше ' + mm.maxMb + ' МБ пропущены: ' + big
        : skipped > 0
          ? 'Пропущено: ' +
            skipped +
            '. Лимит — ' +
            maxCount +
            ', формат — ' +
            mm.fmt
          : note;
    rerender();
  }

  function submit(): void {
    if (anyUploading()) {
      note = 'Дождитесь загрузки файлов';
      rerender();
      return;
    }
    errors = validate(descriptor, values, contacts(), filesCounts());
    const keys = Object.keys(errors);
    if (keys.length) {
      rerender();
      focusFirstError();
      return;
    }
    note = '';
    const body = {
      productId,
      values,
      contacts: contacts(),
      files: uploadedFileMetas(),
    };
    fetch(
      apiBase +
        '/store/extensions/requests/fn/submit?store_id=' +
        encodeURIComponent(storeId),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(body),
      },
    )
      .then((r) => (r && r.ok ? r.json() : null))
      .then((json: { success?: boolean; data?: Record<string, unknown> } | null) => {
        if (json && json.success && json.data) {
          const n =
            json.data.id ?? json.data.number ?? json.data.requestId ?? '';
          formEl.innerHTML = requestSuccessHTML(
            descriptor,
            n,
            String(values._email || ''),
          );
          return;
        }
        note = 'Не удалось отправить заявку. Попробуйте ещё раз.';
        rerender();
      })
      .catch(() => {
        note = 'Не удалось отправить заявку. Попробуйте ещё раз.';
        rerender();
      });
  }

  function resetForm(): void {
    Object.keys(files).forEach((fid) => {
      (files[fid] || []).forEach((x) => {
        if (
          x.url &&
          typeof URL !== 'undefined' &&
          URL.revokeObjectURL &&
          String(x.url).indexOf('blob:') === 0
        ) {
          try {
            URL.revokeObjectURL(x.url);
          } catch {
            /* noop */
          }
        }
      });
    });
    Object.keys(values).forEach((k) => delete values[k]);
    Object.keys(files).forEach((k) => delete files[k]);
    errors = {};
    note = '';
    rerender();
  }

  formEl.addEventListener('input', (ev) => {
    const t = ev.target as HTMLInputElement | null;
    if (!t || !t.getAttribute) return;
    const key = t.getAttribute('data-sf');
    if (!key || t.type === 'checkbox' || t.type === 'file') return;
    values[key] = t.value;
    if (errors[key]) delete errors[key];
    // Точечный счётчик символов — без перерисовки (фокус не теряется).
    if (t.tagName === 'INPUT' && t.type === 'text' && t.maxLength > 0) {
      const wrap = t.closest ? t.closest('.sf-f') : null;
      const cnt = wrap && wrap.querySelector ? wrap.querySelector('.sf-h') : null;
      if (cnt && /из \d+$/.test(cnt.textContent || '')) {
        cnt.textContent = String(t.value).length + ' из ' + t.maxLength;
      }
    }
  });

  formEl.addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement | null;
    if (!t || !t.getAttribute) return;
    const fid = t.getAttribute('data-sfile');
    if (fid) {
      fileAdd(fid, t.files || []);
      t.value = '';
      return;
    }
    const key = t.getAttribute('data-sf');
    if (!key) return;
    if (t.type === 'checkbox') values[key] = t.checked;
    else if (t.tagName === 'SELECT') values[key] = t.value;
    else return;
    if (errors[key]) delete errors[key];
    rerender();
  });

  formEl.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t || !t.closest) return;
    const btn = t.closest('[data-sfbtn]');
    if (btn) {
      const raw = btn.getAttribute('data-sfbtn') || '';
      const sep = raw.indexOf('|');
      const fid = raw.slice(0, sep);
      const opt = raw.slice(sep + 1);
      values[fid] = values[fid] === opt ? '' : opt;
      if (errors[fid]) delete errors[fid];
      rerender();
      return;
    }
    const del = t.closest('[data-sfdel]');
    if (del) {
      const parts = (del.getAttribute('data-sfdel') || '').split('|');
      const fid = parts[0];
      const idx = parseInt(parts[1], 10);
      const arr = files[fid] || [];
      const removed = arr.splice(idx, 1)[0];
      if (
        removed &&
        removed.url &&
        typeof URL !== 'undefined' &&
        URL.revokeObjectURL &&
        String(removed.url).indexOf('blob:') === 0
      ) {
        try {
          URL.revokeObjectURL(removed.url);
        } catch {
          /* noop */
        }
      }
      rerender();
      return;
    }
    if (t.closest('[data-request-submit]')) {
      submit();
      return;
    }
    if (t.closest('[data-request-again]')) {
      resetForm();
    }
  });

  // Действия товара (корзина/«Купить сейчас») прячет ТОЛЬКО когда форма
  // реально пришла — до этого страница работает как без фичи (спека §5).
  return fetch(
    apiBase +
      '/store/extensions/requests/fn/productForm?store_id=' +
      encodeURIComponent(storeId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ product: productId }),
    },
  )
    .then((r) => (r && r.ok ? r.json() : null))
    .then((json: { success?: boolean; data?: unknown } | null) => {
      const d = json && json.success ? json.data : null;
      if (!d || typeof d !== 'object' || !Array.isArray((d as RequestFormDescriptor).fields)) {
        return;
      }
      descriptor = d as RequestFormDescriptor;
      const actions = root.querySelector('[data-product-actions]');
      if (actions) {
        // hidden И display:none: у тем-портов кнопки несут flex-классы,
        // которые перебивают [hidden]{display:none} префлайта.
        actions.setAttribute('hidden', '');
        (actions as HTMLElement).style.display = 'none';
      }
      rerender();
    })
    .catch(() => {
      /* сеть/шлюз недоступны — корзина работает как раньше */
    });
}

/**
 * Строковый рантайм для `<script is:inline set:html={…}>` (паттерн
 * EXTENSION_POINTS_RUNTIME_SOURCE): собран из `.toString()` тех же
 * function-деклараций, что выше, — правка функции обновляет строку сама.
 * Блок вызывает window.__merfyRequestsForm.mountRequestsForm(root, opts).
 */
export const REQUESTS_FORM_RUNTIME_SOURCE = `
${escapeRequestHtml.toString()}
${isRequestMediaField.toString()}
${requestMediaInfo.toString()}
${requestMinDateISO.toString()}
${requestFormatFileSize.toString()}
${visibleFields.toString()}
${requestFieldIconSvg.toString()}
${requestFilesHTML.toString()}
${requestFieldHTML.toString()}
${requestContactHTML.toString()}
${renderFormHTML.toString()}
${requestSuccessHTML.toString()}
${validate.toString()}
${mountRequestsForm.toString()}
if (typeof window !== 'undefined') { window.__merfyRequestsForm = { visibleFields: visibleFields, validate: validate, renderFormHTML: renderFormHTML, mountRequestsForm: mountRequestsForm }; }
`.trim();
