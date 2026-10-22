// Политика превью магазина новой темы (блок 2 «Секций и SDK», часть 2б, решение В2-2 Б). Превью — в iframe
// конструктора с sandbox="allow-scripts allow-forms": без allow-same-origin у документа origin "null", поэтому
// конструктор шлёт ему сообщения с адресом «*» и узнаёт сообщения превью только по окну iframe (event.source). Форма из
// шаблона секции увела бы iframe на чужую страницу: та получала бы сообщения конструктора и слала бы ему select-block и
// delete-block от того же окна. form-action 'none' запрещает отправку форм — как в превью пяти тем на проде, где скрипт
// превью отменяет submit (form-submit-blocked); ссылки в секциях отменяет скрипт превью (preview-sections-agent.ts).
// Политика — тегом meta первым в <head>: заголовки ответа сборщика шлюз в iframe не передаёт.
export const PREVIEW_POLICY = "form-action 'none'";
export const PREVIEW_POLICY_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_POLICY}">`;

// Открывающий тег <head> (с атрибутами или без); <header> под него не подходит.
const HEAD_OPEN = /<head(?:\s[^>]*)?>/i;

export function withPreviewPolicy(html: string): string {
  const head = HEAD_OPEN.exec(html);
  if (head === null) throw new Error('превью без <head>: политику превью некуда записать');
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}${PREVIEW_POLICY_META}${html.slice(at)}`;
}
