/**
 * Лимиты файлов — решены за магазин (спека 118 §7: форматы и размеры не
 * настраиваются). Витрина проверяет по ним файлы при выборе (accept + размер),
 * сервер — при загрузке; количество файлов проверяет validate по maxFiles поля.
 * Форматы совпадают с теми, что ядро узнаёт по содержимому (спека 121 §4, Р11).
 * HEIC и HEIF — ещё и расширением: на компьютере браузер часто не знает их mime.
 * perRequestGb — суммарный лимит на одну отправку формы (2 ГБ).
 */
export const FILE_LIMITS = {
  photo: {
    maxMb: 20,
    accept: [
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/webp",
      "image/gif",
      ".heic",
      ".heif",
    ],
  },
  video: { maxMb: 500, accept: ["video/mp4", "video/quicktime"] },
  file: { maxMb: 50, accept: [".pdf", ".zip", ".docx", ".xlsx", ".pptx"] },
  perRequestGb: 2,
} as const;
