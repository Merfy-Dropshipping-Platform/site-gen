// Ответ по форме проверки при сохранении; в тексте — что разрешено процессу проверки моделью разрешений Node.
const scopes = ['fs.write', 'child', 'worker', 'addon', 'wasi'];
const message = JSON.stringify(Object.fromEntries(scopes.map((scope) => [scope, process.permission.has(scope)])));
const problem = { code: 'build-crashed', file: '', line: null, column: null, message };
process.stdout.write(`${JSON.stringify({ ok: false, problems: [problem] })}\n`);
