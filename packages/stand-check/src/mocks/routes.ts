import { z } from 'zod';
import { parseWith } from '../errors';

const mockRouteSchema = z
  .object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string().startsWith('/'),
    file: z.string().endsWith('.json'),
  })
  .strict();

// mocks/routes.json: метод, адрес, файл ответа (design.md 5.7). Файл — путь от корня пакета.
export const mockRoutesFileSchema = z
  .object({
    $schema: z.string().optional(),
    apiPrefix: z.string().regex(/^\/.*\/$/),
    routes: z.array(mockRouteSchema),
  })
  .strict()
  .superRefine((table, context) => {
    const outside = table.routes.filter((route) => !route.path.startsWith(table.apiPrefix));
    for (const route of outside) {
      context.addIssue({
        code: 'custom',
        message: `${route.method} ${route.path}: адрес вне ${table.apiPrefix}`,
        path: ['routes'],
      });
    }
  });

export type MockRoutes = z.infer<typeof mockRoutesFileSchema>;
export type MockReply = { status: 200; file: string } | { status: 501 };

const NOT_MOCKED: MockReply = { status: 501 };

export function parseMockRoutes(raw: unknown): MockRoutes {
  return parseWith(mockRoutesFileSchema, raw, 'routes-invalid', 'таблица подмен');
}

export const isApiPath = (table: MockRoutes, pathname: string): boolean => pathname.startsWith(table.apiPrefix);

// Ответ на запрос к API: из таблицы — файл; запроса нет в таблице — 501, и он виден в паспорте (design.md 5.7).
export function mockReplyOf(table: MockRoutes, method: string, pathname: string): MockReply {
  const route = table.routes.find((item) => item.method === method && item.path === pathname);
  return route === undefined ? NOT_MOCKED : { status: 200, file: route.file };
}
