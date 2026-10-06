import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StandError } from './errors';

async function readText(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    throw new StandError('file-unreadable', `${file}: файл не прочитан`, { cause: error });
  }
}

// Файл JSON → unknown: дальше его проверяет схема того, кто читает (RULES.md, 3.6).
export async function readJsonFile(file: string): Promise<unknown> {
  const text = await readText(file);
  try {
    const data: unknown = JSON.parse(text);
    return data;
  } catch (error) {
    throw new StandError('file-unreadable', `${file}: не JSON`, { cause: error });
  }
}

export async function writeTextFile(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

export const jsonText = (data: unknown): string => `${JSON.stringify(data, null, 2)}\n`;
