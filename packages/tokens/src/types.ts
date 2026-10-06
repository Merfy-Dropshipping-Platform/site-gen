// Типы пакета — по разделу 9 design.md блока 1. Здесь только типы, кода нет.

export type TokenKind =
  | 'color'
  | 'font'
  | 'weight'
  | 'text'
  | 'tracking'
  | 'radius'
  | 'border-width'
  | 'shadow'
  | 'spacing'
  | 'width'
  | 'choice'
  | 'scheme';

type RuleShapes = {
  alias: { from: string };
  mix: { from: [string, string]; weight: number };
  hover: { from: string; text: string };
  contrast: { from: string };
};
export type RuleName = keyof RuleShapes;
// Параметр R сужает союз до одного правила: так таблица правил остаётся данными и не нужен switch.
export type DeriveRule<R extends RuleName = RuleName> = { [K in R]: { rule: K } & RuleShapes[K] }[R];

export type TextValue = { min: number; max: number; leading: number };
export type FluidValue = { min: number; max: number };
export type ShadowValue = { x: number; y: number; blur: number; spread: number; opacity: number; color?: string };
export type TokenValue = string | number | TextValue | FluidValue | ShadowValue;
export type TokenSet = Record<string, TokenValue>;

export type TokenDef = {
  kind: TokenKind;
  about: string;
  group: string;
  derive?: DeriveRule;
  default?: TokenValue;
  values?: string[];
  on?: string[];
};
export type GroupInfo = { id: string; title: string };
export type Dictionary = {
  v: 1;
  groups: GroupInfo[];
  tokens: Record<string, TokenDef>;
  order: string[];
};

export type ThemeTokens = { root: TokenSet; schemes: Record<string, TokenSet> };
export type ParsedTheme = { dictionary: Dictionary; tokens: ThemeTokens };
export type TokenEdits = { root?: TokenSet; schemes?: Record<string, TokenSet> };
export type ResolvedTokens = { root: TokenSet; schemes: Record<string, TokenSet> };
export type ContrastIssue = { scheme: string; text: string; on: string; ratio: number };

// 'root' или id схемы темы.
export type Scope = string;
export type TokenGroup = { id: string; title: string; names: string[]; required: string[] };
export type SearchEntry = { name: string; token: string; group: string; description: string };
export type ValueSource = 'edit' | 'theme' | 'rule' | 'default' | 'unset';
export type TokenChange = { scope: Scope; name: string; from?: TokenValue; to?: TokenValue };
export type EditCheck = { problems: string[]; changes: TokenChange[]; issues: ContrastIssue[] };

type SearchResults = {
  // full — совпали все слова запроса; по таким считается «Ещё N».
  hits: { hits: { name: string; full: boolean }[]; ignored: string[]; corrected: string[] };
  // Не токен (Т1-5): запись из not-tokens.json.
  refusal: { id: string };
  // Слово запроса, которого нет в словаре.
  unknown: { word: string };
  empty: Record<never, never>;
};
export type SearchKind = keyof SearchResults;
export type TokenSearchResult<K extends SearchKind = SearchKind> = { [P in K]: { kind: P } & SearchResults[P] }[K];

export type TokenState = { dictionary: Dictionary; theme: ThemeTokens; edits: TokenEdits };
export type TokenHost = { load(): Promise<TokenState>; save(edits: TokenEdits): Promise<void> };
export type TokensAction = 'find' | 'describe' | 'check' | 'set' | 'groups' | 'list';
// Вход инструмента после разбора. Снаружи он приходит как unknown: его присылает модель.
export type TokensToolInput = {
  action: TokensAction;
  query?: string;
  name?: string;
  group?: string;
  edits?: TokenEdits;
};
// edits — только у set: новые правки целиком, их сохраняет хозяин.
export type TokensToolResult = { text: string; edits?: TokenEdits };
export type JsonSchema = Record<string, unknown>;
export type ToolSpec = { name: string; description: string; inputSchema: JsonSchema };
export type TokensTool = ToolSpec & { call(input: unknown): Promise<string> };
