// Единственное место, где команды печатают. console в пакете запрещён линтером (no-console).
export const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

export const complain = (line: string): void => {
  process.stderr.write(`${line}\n`);
};
