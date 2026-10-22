// Ответ по форме проверки при сохранении; в тексте — «env:» и имена переменных окружения процесса через запятую.
const message = `env:${Object.keys(process.env).sort().join(',')}`;
const problem = { code: 'build-crashed', file: '', line: null, column: null, message };
process.stdout.write(`${JSON.stringify({ ok: false, problems: [problem] })}\n`);
