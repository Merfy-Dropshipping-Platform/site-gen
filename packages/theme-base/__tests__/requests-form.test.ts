/**
 * requests-form (T013a) — юнит-тесты чистого рантайма «Формы заявки»
 * (спека 118 §5–6): visibleFields (условия показа), validate (тексты ошибок
 * мокапа один в один из prototype.js / submitSite), renderFormHTML (sf-разметка
 * всех 10 типов полей). Функции импортируются напрямую — тот же код, что
 * уезжает на витрину строкой REQUESTS_FORM_RUNTIME_SOURCE.
 */
import {
  visibleFields,
  validate,
  renderFormHTML,
  requestSuccessHTML,
  REQUESTS_FORM_RUNTIME_SOURCE,
  type RequestFormDescriptor,
} from '../runtime/requests-form';

/** Мини-дескриптор «Фотокниги» из мокапа (все ключевые особенности полей). */
const BOOK: RequestFormDescriptor = {
  id: 'book',
  name: 'Фотокнига',
  btn: 'Оставить заявку',
  done: 'Спасибо! Посмотрим фото и ответим в течение дня.',
  phone: 'opt',
  fields: [
    { id: 'f1', type: 'photo', label: 'Фото для книги', req: true, max: 200 },
    { id: 'f2', type: 'buttons', label: 'Формат', req: true, opts: ['20 × 20 см', '30 × 30 см'] },
    { id: 'f3', type: 'select', label: 'Обложка', req: true, opts: ['Твёрдая', 'Ткань'] },
    {
      id: 'f5',
      type: 'select',
      label: 'Цвет ткани',
      req: true,
      opts: ['Лён натуральный', 'Серый'],
      cond: { f: 'f3', v: 'Ткань' },
    },
    { id: 'f6', type: 'text', label: 'Надпись на обложке', req: false, len: 40 },
    { id: 'f8', type: 'textarea', label: 'Пожелания', req: false, len: 1000 },
    { id: 'f9', type: 'date', label: 'К какой дате', req: false, minDays: 16 },
  ],
};

/** Дескриптор, где встречаются все 10 типов полей (для renderFormHTML). */
const ALL_TYPES: RequestFormDescriptor = {
  id: 'all',
  btn: 'Оставить заявку',
  phone: 'req',
  fields: [
    { id: 't1', type: 'text', label: 'Текст', len: 40 },
    { id: 't2', type: 'textarea', label: 'Длинный текст' },
    { id: 't3', type: 'select', label: 'Список', opts: ['А', 'Б'] },
    { id: 't4', type: 'buttons', label: 'Кнопки', opts: ['В', 'Г'] },
    { id: 't5', type: 'checkbox', label: 'Флажок' },
    { id: 't6', type: 'date', label: 'Дата', minDays: 7 },
    { id: 't7', type: 'number', label: 'Число', min: 1, max: 10 },
    { id: 't8', type: 'photo', label: 'Фото', max: 10 },
    { id: 't9', type: 'video', label: 'Видео', max: 1 },
    { id: 't10', type: 'file', label: 'Файл', max: 3 },
  ],
};

const OK_CONTACTS = {
  name: 'Ольга',
  email: 'olga@example.ru',
  phone: '+7 900 111-22-33',
  consent: true,
};

describe('requests-form runtime (T013a)', () => {
  describe('requests: visibleFields', () => {
    it('requests: поле без cond видно всегда', () => {
      const ids = visibleFields(BOOK, {}).map((f) => f.id);
      expect(ids).toContain('f1');
      expect(ids).toContain('f6');
    });

    it('requests: cond скрыт, пока значение поля-условия не совпало', () => {
      expect(visibleFields(BOOK, {}).map((f) => f.id)).not.toContain('f5');
      expect(visibleFields(BOOK, { f3: 'Твёрдая' }).map((f) => f.id)).not.toContain('f5');
    });

    it('requests: cond показан при совпадении значения', () => {
      expect(visibleFields(BOOK, { f3: 'Ткань' }).map((f) => f.id)).toContain('f5');
    });

    it('requests: мусорный дескриптор даёт пустой список', () => {
      expect(visibleFields(null, {})).toEqual([]);
      expect(visibleFields(undefined, undefined)).toEqual([]);
      expect(visibleFields({} as RequestFormDescriptor, {})).toEqual([]);
    });
  });

  describe('requests: validate (тексты ошибок мокапа)', () => {
    it('requests: пустая форма — все обязательные ошибки + контакты + согласие', () => {
      const err = validate(BOOK, {}, {}, {});
      expect(err.f1).toBe('Добавьте хотя бы одно фото');
      expect(err.f2).toBe('Выберите вариант');
      expect(err.f3).toBe('Выберите вариант');
      expect(err._name).toBe('Как к вам обращаться?');
      expect(err._email).toBe('Нужна почта: сюда придёт ответ магазина');
      expect(err._ok).toBe('Без согласия магазин не сможет принять заявку');
    });

    it('requests: скрытое условием обязательное поле ошибкой не становится', () => {
      const err = validate(BOOK, { f2: '20 × 20 см', f3: 'Твёрдая' }, OK_CONTACTS, { f1: 3 });
      expect(err.f5).toBeUndefined();
    });

    it('requests: то же поле обязательно, когда условие выполнено', () => {
      const err = validate(BOOK, { f2: '20 × 20 см', f3: 'Ткань' }, OK_CONTACTS, { f1: 3 });
      expect(err.f5).toBe('Выберите вариант');
    });

    it('requests: фото/видео/файл — свой текст на каждый тип', () => {
      const d: RequestFormDescriptor = {
        phone: 'off',
        fields: [
          { id: 'ph', type: 'photo', label: 'Фото', req: true },
          { id: 'vd', type: 'video', label: 'Видео', req: true },
          { id: 'fl', type: 'file', label: 'Файл', req: true },
        ],
      };
      const err = validate(d, {}, OK_CONTACTS, {});
      expect(err.ph).toBe('Добавьте хотя бы одно фото');
      expect(err.vd).toBe('Добавьте видео');
      expect(err.fl).toBe('Добавьте файл');
      // файлы выбраны → ошибок нет
      expect(validate(d, {}, OK_CONTACTS, { ph: 1, vd: 1, fl: 2 })).toEqual({});
    });

    it('requests: обязательный флажок — «Отметьте, чтобы продолжить»', () => {
      const d: RequestFormDescriptor = {
        phone: 'off',
        fields: [{ id: 'cb', type: 'checkbox', label: 'Срочно', req: true }],
      };
      expect(validate(d, {}, OK_CONTACTS, {}).cb).toBe('Отметьте, чтобы продолжить');
      expect(validate(d, { cb: true }, OK_CONTACTS, {}).cb).toBeUndefined();
    });

    it('requests: обязательный text/textarea — «Заполните поле», пробел не спасает', () => {
      const d: RequestFormDescriptor = {
        phone: 'off',
        fields: [
          { id: 'tx', type: 'text', label: 'Надпись', req: true },
          { id: 'ta', type: 'textarea', label: 'Пожелания', req: true },
        ],
      };
      const err = validate(d, { tx: '   ', ta: '' }, OK_CONTACTS, {});
      expect(err.tx).toBe('Заполните поле');
      expect(err.ta).toBe('Заполните поле');
      expect(validate(d, { tx: 'Маме', ta: 'срочно' }, OK_CONTACTS, {})).toEqual({});
    });

    it('requests: телефон — «Нужен телефон» только при phone=req', () => {
      const base = { fields: [] as RequestFormDescriptor['fields'] };
      const noPhone = { ...OK_CONTACTS, phone: '' };
      expect(validate({ ...base, phone: 'req' }, {}, noPhone, {})._phone).toBe('Нужен телефон');
      expect(validate({ ...base, phone: 'opt' }, {}, noPhone, {})._phone).toBeUndefined();
      expect(validate({ ...base, phone: 'off' }, {}, {}, {})._phone).toBeUndefined();
    });

    it('requests: почта проверяется регуляркой мокапа', () => {
      const d: RequestFormDescriptor = { phone: 'off', fields: [] };
      expect(validate(d, {}, { ...OK_CONTACTS, email: 'olga@example' }, {})._email).toBeDefined();
      expect(validate(d, {}, { ...OK_CONTACTS, email: 'a b@c.ru' }, {})._email).toBeDefined();
      expect(validate(d, {}, { ...OK_CONTACTS, email: 'olga@example.ru' }, {})._email).toBeUndefined();
    });

    it('requests: заполненная форма и контакты — пустая карта ошибок', () => {
      expect(
        validate(
          BOOK,
          { f1: 'x', f2: '20 × 20 см', f3: 'Ткань', f5: 'Серый', f6: 'Наша история' },
          OK_CONTACTS,
          { f1: 12 },
        ),
      ).toEqual({});
    });
  });

  describe('requests: renderFormHTML (sf-разметка)', () => {
    it('requests: каркас sf — sf-box, заголовок-кнопка, контакты, согласие, кнопка', () => {
      const html = renderFormHTML(BOOK);
      expect(html).toContain('<div class="sf">');
      expect(html).toContain('<div class="sf-box">');
      expect(html).toContain('<h4>Оставить заявку</h4>');
      expect(html).toContain('Как с вами связаться');
      expect(html).toContain('data-sf="_name"');
      expect(html).toContain('data-sf="_email"');
      expect(html).toContain('data-sf="_ok"');
      expect(html).toContain('Согласна(сен) на обработку персональных данных');
      expect(html).toContain('data-request-submit');
      expect(html).toContain(
        'Ответ придёт на почту и в «Мои заявки». Платить сейчас не нужно.',
      );
    });

    it('requests: phone=off — поля телефона нет; req/opt — есть', () => {
      expect(renderFormHTML({ phone: 'off', fields: [] })).not.toContain('data-sf="_phone"');
      expect(renderFormHTML({ phone: 'req', fields: [] })).toContain('data-sf="_phone"');
      expect(renderFormHTML({ phone: 'opt', fields: [] })).toContain('data-sf="_phone"');
    });

    it('requests: text — инпут + счётчик «0 из N»', () => {
      const html = renderFormHTML(ALL_TYPES);
      expect(html).toContain('data-sf="t1"');
      expect(html).toContain('maxlength="40"');
      expect(html).toContain('0 из 40');
    });

    it('requests: textarea — sf-in с maxlength', () => {
      const html = renderFormHTML(ALL_TYPES, { t2: 'Пожелание' });
      expect(html).toContain('<textarea class="sf-in"');
      expect(html).toContain('>Пожелание</textarea>');
    });

    it('requests: select — placeholder «Выберите» и варианты', () => {
      const html = renderFormHTML(ALL_TYPES, { t3: 'Б' });
      expect(html).toContain('<select class="sf-in"');
      expect(html).toContain('<option value="">Выберите</option>');
      expect(html).toContain('<option selected>Б</option>');
    });

    it('requests: buttons — radiogroup с data-sfbtn «поле|вариант»', () => {
      const html = renderFormHTML(ALL_TYPES, { t4: 'Г' });
      expect(html).toContain('role="radiogroup"');
      expect(html).toContain('data-sfbtn="t4|В"');
      expect(html).toContain('data-sfbtn="t4|Г"');
      expect(html).toMatch(/role="radio" aria-checked="true" class="on" data-sfbtn="t4\|Г"/);
    });

    it('requests: checkbox — sf-chk с data-sf', () => {
      const html = renderFormHTML(ALL_TYPES, { t5: true });
      expect(html).toContain('class="sf-chk"');
      expect(html).toMatch(/type="checkbox" id="sf-rq-t5" data-sf="t5" checked/);
    });

    it('requests: date — min = сегодня + minDays', () => {
      const html = renderFormHTML(ALL_TYPES);
      const d = new Date();
      d.setDate(d.getDate() + 7);
      const iso = d.toISOString().slice(0, 10);
      expect(html).toContain(`type="date"`);
      expect(html).toContain(`min="${iso}"`);
    });

    it('requests: number — min/max атрибуты', () => {
      const html = renderFormHTML(ALL_TYPES);
      expect(html).toMatch(/type="number"[^>]*inputmode="numeric"/);
      expect(html).toContain('min="1"');
      expect(html).toContain('max="10"');
    });

    it('requests: фото/видео/файл — sf-up, accept, форматы и лимиты мокапа', () => {
      const html = renderFormHTML(ALL_TYPES);
      expect((html.match(/class="sf-up"/g) || []).length).toBe(3);
      expect(html).toContain('data-sfile="t8"');
      expect(html).toContain('data-sfile="t9"');
      expect(html).toContain('data-sfile="t10"');
      expect(html).toContain('JPEG, PNG или HEIC до 20 МБ');
      expect(html).toContain('MP4 или MOV до 500 МБ');
      expect(html).toContain('PDF или ZIP до 50 МБ');
      expect(html).toContain('до 10 фото');
      expect(html).toMatch(/multiple/); // max > 1 → multiple
    });

    it('requests: условное поле не рендерится, пока условие не выполнено', () => {
      expect(renderFormHTML(BOOK)).not.toContain('data-sf="f5"');
      expect(renderFormHTML(BOOK, { f3: 'Ткань' })).toContain('data-sf="f5"');
    });

    it('requests: текст дескриптора экранируется', () => {
      const evil: RequestFormDescriptor = {
        btn: '<script>alert(1)</script>',
        fields: [{ id: 'x', type: 'text', label: '"><img src=x onerror=alert(1)>' }],
      };
      const html = renderFormHTML(evil);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    });

    it('requests: пустой дескриптор — всё равно валидный каркас контактов', () => {
      const html = renderFormHTML(null);
      expect(html).toContain('<h4>Оставить заявку</h4>');
      expect(html).toContain('data-sf="_name"');
    });

    it('requests: REQUESTS_FORM_RUNTIME_SOURCE собран из тех же функций', () => {
      expect(REQUESTS_FORM_RUNTIME_SOURCE).toContain('function visibleFields(');
      expect(REQUESTS_FORM_RUNTIME_SOURCE).toContain('function validate(');
      expect(REQUESTS_FORM_RUNTIME_SOURCE).toContain('function renderFormHTML(');
      expect(REQUESTS_FORM_RUNTIME_SOURCE).toContain('function mountRequestsForm(');
      expect(REQUESTS_FORM_RUNTIME_SOURCE).toContain('function requestSuccessHTML(');
      expect(REQUESTS_FORM_RUNTIME_SOURCE).toContain('__merfyRequestsForm');
      // строка — это JS: типов TS внутри быть не должно
      expect(REQUESTS_FORM_RUNTIME_SOURCE).not.toContain('RequestFormDescriptor');
    });
  });

  describe('requests: renderFormHTML с состоянием (T013b)', () => {
    it('requests: errors → класс bad, aria-invalid и sf-e у поля и контактов', () => {
      const html = renderFormHTML(BOOK, {}, {
        errors: { f2: 'Выберите вариант', _email: 'Нужна почта: сюда придёт ответ магазина' },
      });
      expect(html).toMatch(/class="sf-in bad"[^>]*aria-invalid="true"/);
      expect(html).toContain('<p class="sf-e" id="sf-rq-f2-e">Выберите вариант</p>');
      expect(html).toContain('id="sf-rq-_email-e"');
    });

    it('requests: files → миниатюры фото (blob) и строки видео/файла с data-sfdel', () => {
      const photo = renderFormHTML(BOOK, {}, {
        files: { f1: [{ name: 'a.jpg', size: '3,4 МБ', url: 'blob:x', bytes: 1 }] },
      });
      expect(photo).toContain('class="sf-thumbs"');
      expect(photo).toContain('src="blob:x"');
      expect(photo).toContain('data-sfdel="f1|0"');
      expect(photo).toContain('Добавить ещё');
      expect(photo).toContain('выбрано 1');
      const video = renderFormHTML(
        { phone: 'off', fields: [{ id: 'v1', type: 'video', label: 'Видео', max: 1 }] },
        {},
        { files: { v1: [{ name: 'clip.mp4', size: '184 МБ', uploading: true }] } },
      );
      expect(video).toContain('▶');
      expect(video).toContain('clip.mp4');
      expect(video).toContain('загрузка…');
      const doc = renderFormHTML(
        { phone: 'off', fields: [{ id: 'd1', type: 'file', label: 'Чертёж', max: 3 }] },
        {},
        { files: { d1: [{ name: 'plan.pdf', size: '84 КБ', failed: true }] } },
      );
      expect(doc).toContain('PDF');
      expect(doc).toContain('не загрузился');
    });

    it('requests: heic-фото без конвертации — плашка HEIC, не битый img', () => {
      const html = renderFormHTML(BOOK, {}, {
        files: { f1: [{ name: 'ios.heic', heic: true, url: 'blob:h' }] },
      });
      expect(html).toContain('<span class="more">HEIC</span>');
    });

    it('requests: note → сообщение-alert над формой', () => {
      const html = renderFormHTML(BOOK, {}, { note: 'Загрузка файлов временно недоступна' });
      expect(html).toContain('data-request-note');
      expect(html).toContain('role="alert"');
    });
  });

  describe('requests: requestSuccessHTML (T013b)', () => {
    it('requests: экран успеха — номер, done-текст, почта, кнопка сброса', () => {
      const html = requestSuccessHTML(BOOK, 2083, 'olga@example.ru');
      expect(html).toContain('Заявка №2083 отправлена');
      expect(html).toContain('Спасибо! Посмотрим фото и ответим в течение дня.');
      expect(html).toContain('olga@example.ru');
      expect(html).toContain('data-request-again');
      expect(html).toContain('Отправить ещё одну');
    });
  });
});
