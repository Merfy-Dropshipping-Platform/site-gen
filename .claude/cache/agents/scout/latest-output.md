# Codebase Report: Product Creation — Category Handling
Generated: 2026-03-23

## Summary

The product creation form requires an explicit category selection — there is no auto-assignment of a default category. The `categoryId` is a non-nullable required UUID both in the DTO and the DB schema. The backend validates that the category exists before creating the product. Categories are seeded at module init from a static JSON file (333 lines, Russian e-commerce tree).

---

## Questions Answered

### Q1: Product creation/edit form component

**Location:** `frontend/MerfyFrontend/src/components/OnProductsPage/MainBlockAdd/MainBlockAdd.tsx`
**Constants/types:** `frontend/MerfyFrontend/src/components/OnProductsPage/MainBlockAdd/mainBlockAdd.ts`

Single component handles both create and edit modes (controlled by `productId` prop).

---

### Q2: How categoryId is set when creating a product

The form stores `values.category` (display label, e.g. "Одежда") and `values.subcategory` (sublabel) as strings.
On submit (`handleSubmit`, line 344), the categoryId is resolved from a local lookup map:

```
// MainBlockAdd.tsx lines 363-369
const categoryKey = values.subcategory || values.category;
const categoryId =
  (categoryKey && categoryIdByName[categoryKey])
    ? categoryIdByName[categoryKey]
    : (values.category && categoryIdByName[values.category])
      ? categoryIdByName[values.category]
      : undefined;
```

`categoryIdByName` is a `Record<string, string>` (name → UUID) built at mount time by calling `GET /products/categories` (`getCategories()`, lines 122-167). If the API call fails, the map stays empty and submission is blocked.

---

### Q3: Is there a category selector/dropdown in the form?

Yes. There is a custom dropdown (not a `<select>`) with:
- A text search input (`categorySearch` state, line 88)
- Filtered list of `MainBlockAddCategory` items from `MAIN_BLOCK_ADD_CATEGORIES` (static list in `mainBlockAdd.ts`, 183+)
- Two-level picker: clicking a category with subcategories shows a sub-panel; clicking one without closes immediately

The dropdown items come from the **static hardcoded list** in `mainBlockAdd.ts` (Russian category labels). The **UUIDs** come separately from the API at mount. The static labels must match the API names for the lookup to work.

---

### Q4: What happens if no category is selected — is "default" auto-assigned?

**No default is auto-assigned.** Category is required. On submit (lines 404-406):

```typescript
if (!categoryId) {
  nextErrors.category = "Выберите категорию для товара";
}
```

Zod also validates it (line 38):
```typescript
categoryId: z.string().min(1, "Выберите категорию для товара"),
```

There is also a special error when categories failed to load (lines 395-402):
```typescript
if (!categoryId && Object.keys(categoryIdByName).length === 0 && !nextErrors.category) {
  nextErrors.category = "Категории не загружены. Проверьте, что сервис товаров запущен.";
}
```

The backend also validates: `products.service.ts` line 113 calls `this.categoryService.findOne(createProductDto.categoryId)` which throws `NotFoundException` if the UUID doesn't exist.

---

### Q5: Backend — how createProduct handles categoryId

**File:** `backend/services/product/src/modules/products/products.service.ts`

```typescript
// line 113
await this.categoryService.findOne(createProductDto.categoryId);
```

This is a hard validation — if the category UUID doesn't exist, the entire transaction is rolled back and a 404 is thrown.

The `categoryId` column in the `products` table is `NOT NULL` with a `RESTRICT` foreign key:
```sql
FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
```

---

### Q6: Is there a default category creation logic?

**No default category auto-creation** exists in the product creation flow.

There **is** a default **collection** auto-creation (`collectionsService.ensureDefaultCollection(shopId)`, line 178) — but that is separate from categories.

For categories, the backend seeds a static tree at module init (`CategoriesService.onModuleInit()` calls `seedCategories()`), which runs once when the DB is empty. The seed data comes from `categories.json` — a 333-line Russian product taxonomy with no "default" entry.

---

## Schema

```sql
CREATE TABLE "categories" (
  "id"       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name"     varchar(150) NOT NULL,
  "parentId" uuid,           -- self-reference, nullable for root
  "level"    integer DEFAULT 0,
  "slug"     varchar UNIQUE NOT NULL,
  FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE CASCADE
);

CREATE TABLE "products" (
  ...
  "categoryId" uuid NOT NULL,
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT
);
```

Tree is 3 levels deep: level 0 = root (e.g. "Одежда и аксессуары"), level 1 = mid (e.g. "Одежда"), level 2 = leaf (e.g. "Верхняя одежда").

---

## Key Files

| File | Purpose |
|------|---------|
| `frontend/MerfyFrontend/src/components/OnProductsPage/MainBlockAdd/MainBlockAdd.tsx` | Product create/edit form — full component |
| `frontend/MerfyFrontend/src/components/OnProductsPage/MainBlockAdd/mainBlockAdd.ts` | Static category list, form state types, text constants |
| `frontend/MerfyFrontend/src/lib/products.ts` | `getCategories()` API call → `GET /products/categories` |
| `backend/services/product/src/modules/products/dto/create-product.dto.ts` | `CreateProductDto` — `categoryId: string` (required UUID) |
| `backend/services/product/src/modules/products/products.service.ts` | `create()` — validates categoryId exists, wraps in transaction |
| `backend/services/product/src/modules/categories/categories.service.ts` | `findAll()`, `findOne()`, seeds categories on init |
| `backend/services/product/src/modules/categories/entities/category.entity.ts` | TypeORM entity — id, name, parentId, level, slug |
| `backend/services/product/src/common/database/seeds/categories.seed.ts` | Seed runner — creates tree from JSON, skips if any rows exist |
| `backend/services/product/src/common/database/seeds/categories.json` | 333-line Russian e-commerce taxonomy |

