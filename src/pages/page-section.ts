/**
 * Секция «Страница» (блок Puck `Page`) контент-страницы магазина — одна
 * форма для всех, кто её создаёт: новая страница из кабинета
 * (`PagesService.createPage`), тело страницы в редакторе «Страницы»
 * (`PagesService.updatePage`), перенос легаси-страницы при смене темы
 * (`SetTheme`, долг Н9). `pageId: ""` — свободный режим: секция не привязана к
 * политике магазина. Зеркалит клиентский `createEmptyPageData` конструктора.
 */
export interface PageSectionText {
  heading?: string;
  content?: string;
}

export function emptyPageBlock(pageId: string, text: PageSectionText = {}) {
  return {
    type: "Page",
    props: {
      id: `Page-${pageId}`,
      pageId: "",
      ...text,
      headingSize: "medium",
      colorScheme: "scheme-1",
      padding: { top: 80, bottom: 80 },
    } as Record<string, unknown>,
  };
}
