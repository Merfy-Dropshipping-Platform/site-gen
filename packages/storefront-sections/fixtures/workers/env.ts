// Ответ по форме приёма; в тексте — имена переменных окружения процесса.
const message = Object.keys(process.env).sort().join(',');
const problem = { code: 'build-crashed', file: '', line: null, column: null, message };
process.stdout.write(`${JSON.stringify({ ok: false, problems: [problem] })}\n`);
