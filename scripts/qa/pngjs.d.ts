/** Ровно то, чем пользуются замеры из `pngjs` (своих типов у пакета нет). */
declare module "pngjs" {
  export const PNG: {
    sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } };
  };
}
