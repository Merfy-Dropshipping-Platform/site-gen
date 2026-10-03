/**
 * requests-form — чистый рантайм «Формы заявки» для витрины (спека 118,
 * задача T013a; заготовка под T013b).
 *
 * ЧТО ЭТО. Три функции без DOM и событий: visibleFields (условия показа
 * полей), validate (тексты ошибок мокапа — один в один из прототипа
 * scratchpad/zayavki-screens/prototype.js, submitSite) и renderFormHTML
 * (sf-разметка мокапа: sfForm/sfField → строка HTML). Потребитель — блок
 * blocks/RequestForm (каркас) и, в T013b, встраивание в Product: контейнер
 * [data-request-form] + window-обвязка + загрузка файлов.
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
 * покрыты тестами (`__tests__/requests-form.test.ts` импортирует функции
 * напрямую). Один текст — и на витрине, и в проверке. Все объявления —
 * `function name(…)`, чтобы при конкатенации поднимались (hoisting) в общую
 * область видимости инжектированного скрипта; тела функций не ссылаются на
 * модульные константы — только на другие function-декларации из этого же
 * набора.
 *
 * НЕ ЗДЕСЬ (T013b): UI-обвязка и события (input/change/submit), загрузка
 * файлов в MinIO, «Заявка №N отправлена», подстановка дескриптора с бэка
 * (GET /store/requests/product/:id). Серверные лимиты (дата ≥ minDays,
 * число min/max, размер файла) проверяет @merfy/forms на сервере (T002) —
 * у мокапа нет своих текстов для них, здесь они не придумываются.
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

/** Типы-файлы: лимиты и подписи мокапа (спека §7; FILE_LIMITS в @merfy/forms). */
export const REQUEST_FILE_LIMITS: Record<
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
    descriptor &&
    typeof descriptor === 'object' &&
    Array.isArray(descriptor.fields)
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

/**
 * Разметка одного поля — порт sfField мокапа (статичное состояние: без
 * выбранных файлов и ошибок; values — предзаполнение). Хуки для T013b:
 * data-sf (значение), data-sfbtn (кнопки-варианты «fieldId|option»),
 * data-sfile (файл-инпут). idPrefix изолирует id при нескольких формах
 * на странице.
 */
export function requestFieldHTML(
  f: RequestFieldDescriptor,
  values: Record<string, unknown> | null | undefined,
  idPrefix: string,
): string {
  const vals = values || {};
  const v = vals[f.id];
  const id = (idPrefix || 'sf-rq') + '-' + f.id;
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
      '</div>'
    );
  }

  let inp = '';
  if (f.type === 'text') {
    const max = f.len || 200;
    inp =
      '<input class="sf-in" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '" maxlength="' +
      max +
      '" value="' +
      escapeRequestHtml(v) +
      '" autocomplete="off"><p class="sf-h">' +
      (v ? String(v).length : 0) +
      ' из ' +
      max +
      '</p>';
  } else if (f.type === 'textarea') {
    inp =
      '<textarea class="sf-in" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '" maxlength="' +
      (f.len || 1000) +
      '">' +
      escapeRequestHtml(v) +
      '</textarea>';
  } else if (f.type === 'select') {
    inp =
      '<select class="sf-in" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '"><option value="">Выберите</option>' +
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
      '<input type="date" class="sf-in" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '" min="' +
      requestMinDateISO(f.minDays) +
      '" value="' +
      escapeRequestHtml(v) +
      '">';
  } else if (f.type === 'number') {
    inp =
      '<input type="number" class="sf-in" id="' +
      id +
      '" data-sf="' +
      escapeRequestHtml(f.id) +
      '" inputmode="numeric" value="' +
      escapeRequestHtml(v) +
      '"' +
      (f.min !== undefined && f.min !== null ? ' min="' + f.min + '"' : '') +
      (f.max !== undefined && f.max !== null ? ' max="' + f.max + '"' : '') +
      '>';
  } else if (isRequestMediaField(f.type)) {
    const mm = requestMediaInfo(f.type);
    const maxCount = f.max || 1;
    inp =
      '<label class="sf-up" for="' +
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
      '</span><span class="tx"><span>Выбрать ' +
      (f.type === 'photo' ? 'фото' : f.type === 'video' ? 'видео' : 'файл') +
      '</span><small>' +
      mm.fmt +
      ' · до ' +
      maxCount +
      ' ' +
      (f.type === 'photo' ? 'фото' : f.type === 'video' ? 'видео' : 'файлов') +
      '</small></span></label>';
  }

  // Кнопкам-вариантам label нужен отдельным блоком (label for на группу
  // кнопок не вешается) — как в мокапе, через span aria-labelledby.
  const labelRow =
    f.type === 'buttons'
      ? '<div class="sf-l"><span id="' + id + '-g">' + escapeRequestHtml(f.label) + '</span><span class="sf-q">' + (f.req ? 'обязательно' : 'необязательно') + '</span></div>'
      : lab;
  return '<div class="sf-f"' + (f.type === 'buttons' ? ' role="group"' : '') + '>' + labelRow + inp + hint + '</div>';
}

/** Контактное поле (имя/почта/телефон) — порт helper'а c() мокапа. */
export function requestContactHTML(
  key: string,
  label: string,
  type: string,
  reqLabel: string,
  value: unknown,
  idPrefix: string,
  placeholder?: string,
): string {
  const id = (idPrefix || 'sf-rq') + '-' + key;
  return (
    '<div class="sf-f"><div class="sf-l"><label for="' +
    id +
    '">' +
    label +
    '</label><span class="sf-q">' +
    reqLabel +
    '</span></div><input class="sf-in" id="' +
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
    '"></div>'
  );
}

/**
 * Полная sf-разметка формы — порт sfForm мокапа: заголовок-кнопка (btn),
 * видимые поля, контакты («Как с вами связаться»: имя + почта, телефон по
 * режиму descriptor.phone), согласие, кнопка отправки (data-request-submit —
 * событие вешает T013b), примечание. values — предзаполнение (влияет и на
 * условия показа). Стили — RequestFormSfStyles (контейнер .rq-sf).
 */
export function renderFormHTML(
  descriptor: RequestFormDescriptor | null | undefined,
  values?: Record<string, unknown> | null,
): string {
  const d = descriptor && typeof descriptor === 'object' ? descriptor : {};
  const vals = values || {};
  const prefix = 'sf-rq';
  const btn = d.btn || 'Оставить заявку';
  const phone = d.phone;

  const fields = visibleFields(d, vals)
    .map((f) => requestFieldHTML(f, vals, prefix))
    .join('');

  const contacts =
    '<div class="sf-sec">Как с вами связаться</div><div class="sf-two">' +
    requestContactHTML('_name', 'Имя', 'text', 'обязательно', vals._name, prefix) +
    requestContactHTML('_email', 'Почта', 'email', 'сюда придёт ответ', vals._email, prefix, 'name@mail.ru') +
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
        ));

  const consent =
    '<div class="sf-f"><label class="sf-chk" for="' +
    prefix +
    '-_ok"><input type="checkbox" id="' +
    prefix +
    '-_ok" data-sf="_ok"' +
    (vals._ok ? ' checked' : '') +
    '><span>Согласна(сен) на обработку персональных данных и файлов по политике магазина</span></label></div>';

  const submit =
    '<button type="button" class="sf-sub" data-request-submit>' +
    escapeRequestHtml(btn) +
    '</button><p class="sf-note">Ответ придёт на почту и в «Мои заявки». Платить сейчас не нужно.</p>';

  return (
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

/**
 * Строковый рантайм для `<script is:inline set:html={…}>` (паттерн
 * EXTENSION_POINTS_RUNTIME_SOURCE): собран из `.toString()` тех же
 * function-деклараций, что выше, — правка функции обновляет строку сама.
 * T013b вызовет window.__merfyRequestsForm.renderFormHTML(descriptor) и т.д.
 */
export const REQUESTS_FORM_RUNTIME_SOURCE = `
${escapeRequestHtml.toString()}
${isRequestMediaField.toString()}
${requestMediaInfo.toString()}
${requestMinDateISO.toString()}
${visibleFields.toString()}
${requestFieldIconSvg.toString()}
${requestFieldHTML.toString()}
${requestContactHTML.toString()}
${renderFormHTML.toString()}
${validate.toString()}
if (typeof window !== 'undefined') { window.__merfyRequestsForm = { visibleFields: visibleFields, validate: validate, renderFormHTML: renderFormHTML }; }
`.trim();
