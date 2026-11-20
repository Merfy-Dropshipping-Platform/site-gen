export interface StoredObject {
  key: string;
  size: number;
}

export interface PutOptions {
  contentType: string;
  cacheControl: string;
}

/** Всё, что модулю картинок нужно от хранилища; MinIO прячется за этим интерфейсом. */
export interface ImageStore {
  put(key: string, body: Buffer, options: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Все объекты под префиксом, одним обходом бакета. */
  list(prefix: string): Promise<StoredObject[]>;
}
