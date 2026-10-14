import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regra do sistema: confirmações são feitas em modal próprio.
// Nenhum código do front-end pode chamar alert(), confirm() ou prompt().

const PASTA_PUBLICA = fileURLToPath(new URL('../public', import.meta.url));
const PROIBIDO = /\b(?:window\s*\.\s*)?(alert|confirm|prompt)\s*\(/;

async function arquivosFrontEnd(pasta) {
  const entradas = await readdir(pasta, { withFileTypes: true, recursive: true });
  return entradas
    .filter((e) => e.isFile() && /\.(js|html)$/.test(e.name))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

test('front-end não usa alert/confirm/prompt nativos', async () => {
  const arquivos = await arquivosFrontEnd(PASTA_PUBLICA);
  assert.ok(arquivos.length > 0, 'nenhum arquivo encontrado em public/');

  const ocorrencias = [];
  for (const arquivo of arquivos) {
    const linhas = (await readFile(arquivo, 'utf8')).split(/\r?\n/);
    linhas.forEach((linha, i) => {
      if (PROIBIDO.test(linha)) ocorrencias.push(`${arquivo}:${i + 1}: ${linha.trim()}`);
    });
  }
  assert.deepEqual(ocorrencias, []);
});
