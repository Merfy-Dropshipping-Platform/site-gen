import { checkAttributeWrite } from '../attributes';

// Граница src картинки (общая у card-photos и zoom): адрес, который её не проходит, из списка выпадает.
export function safePhotos(photos: readonly string[]): readonly string[] {
  return photos.filter((photo) => {
    try {
      checkAttributeWrite('img', 'src', photo);
      return true;
    } catch {
      return false;
    }
  });
}
