import { startPreview } from './preview';

// Вход dist/preview.js (блок 5 «Секций и SDK», часть 5г): код — модулем из blob:-адреса. Рамка превью — песочница без
// allow-same-origin (origin "null", блок 2), адрес blob: создаёт сам документ рамки. Перезагрузка — всей рамки.
async function importCode(code: string): Promise<unknown> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const module: unknown = await import(url);
    return module;
  } finally {
    URL.revokeObjectURL(url);
  }
}

startPreview({ win: window, importCode, reload: () => window.location.reload() });
