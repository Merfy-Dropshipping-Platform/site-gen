// Типы инструмента стенда — design.md блока 2, раздел 6. Target, ScriptKind, FieldShape, TokenSetName, ScenarioFacts
// и ScenarioRun — имена для типов, которые в разделе 6 записаны по месту; сами типы те же.

export type PassportField = 'scripts' | 'globals' | 'storage' | 'cookies' | 'requests' | 'errors' | 'tokens' | 'fonts';
export type Target = 'local' | 'dev';
export type ScriptKind = 'external' | 'inline' | 'module' | 'json';
export type ScriptEntry = { src: string; kind: ScriptKind; bytes: number; hash?: string };
export type RequestEntry = { url: string; status: number };
export type Passport = {
  version: 1;
  page: string; // '/theme-stand'
  target: Target;
  scripts: ScriptEntry[];
  globals: Record<string, string>;
  storage: string[];
  cookies: string[];
  requests: RequestEntry[];
  errors: string[];
  tokens: Record<string, string>;
  fonts: string[];
};

export type Op = 'added' | 'removed' | 'changed';
export type Severity = 'red' | 'amber';
export type FieldShape = 'list' | 'map' | 'set';
export type FieldRule = {
  field: PassportField;
  shape: FieldShape;
  key?: string; // для list: src или url
  severity: Partial<Record<Op, Severity>>;
  reason: { all: string } & Partial<Record<Op, string>>;
};
export type Difference = {
  field: PassportField;
  op: Op;
  name: string;
  before?: unknown;
  after?: unknown;
  severity: Severity;
  reason: string;
};
export type Verdict = 'clean' | 'amber' | 'red';

export type TokenSetName = 'base';
export type Expectation =
  | { kind: 'tokens-present'; set: TokenSetName }
  | { kind: 'sections-present'; ids: string[] }
  | { kind: 'fonts-loaded' }
  | { kind: 'no-errors' }
  | { kind: 'no-globals' };
export type Scenario = {
  id: string;
  title: string;
  since: string;
  open: string;
  steps: [];
  expect: Expectation[];
  eyes: string[];
};
export type ExpectationResult = { kind: Expectation['kind']; ok: boolean; detail: string };
export type ScenarioFacts = { passport: Passport; sections: string[] };
export type ScenarioRun = { scenario: Scenario; target: Target; ok: boolean };
