// Переход на другую страницу витрины (блок 10, часть 10а): одно место — тесты подменяют go.
export const navigation = { go: (path: string): void => window.location.assign(path) };
