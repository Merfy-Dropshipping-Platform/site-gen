import standInputsJson from '../fixtures/stand-inputs.json';
import { StorefrontBuildError } from '../src/errors';
import { parseBuildInputs, type BuildInputs } from '../src/inputs';

// Общий образец тестов: входы стенда (fixtures/stand-inputs.json) и их копия с одной правкой.
export const standInputs: BuildInputs = parseBuildInputs(standInputsJson);

export function changedInputs(change: (inputs: BuildInputs) => void): BuildInputs {
  const copy = structuredClone(standInputs);
  change(copy);
  return copy;
}

// Копия сырого JSON входов: в неё можно записать и то, чего схема не пропустит.
export function rawInputs(change: (raw: typeof standInputsJson) => void): unknown {
  const copy = structuredClone(standInputsJson);
  change(copy);
  return copy;
}

// Ошибка пакета из вызова. Вызов ничего не бросил — тест падает с понятным текстом.
export function errorOf(work: () => unknown): StorefrontBuildError {
  try {
    work();
  } catch (error) {
    if (error instanceof StorefrontBuildError) return error;
    throw error;
  }
  throw new Error('ошибки не было, а должна быть');
}
