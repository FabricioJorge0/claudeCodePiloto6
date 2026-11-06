import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regras do sistema verificadas no código (seção 7.1 do PLANO_EVOLUCAO_SEMA.md).

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

async function arquivosJs(pasta) {
  const entradas = await readdir(join(RAIZ, pasta), { withFileTypes: true, recursive: true });
  return entradas
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(e.parentPath ?? e.path, e.name))
    .filter((arquivo) => !relative(RAIZ, arquivo).split(sep).includes('vendor'));
}

async function ocorrencias(arquivos, padrao) {
  const achados = [];
  for (const arquivo of arquivos) {
    const linhas = (await readFile(arquivo, 'utf8')).split(/\r?\n/);
    linhas.forEach((linha, i) => {
      if (padrao.test(linha) && !/^\s*\/\//.test(linha)) achados.push(`${relative(RAIZ, arquivo)}:${i + 1}: ${linha.trim()}`);
    });
  }
  return achados;
}

test('front-end não injeta HTML (innerHTML, outerHTML, insertAdjacentHTML, document.write)', async () => {
  const arquivos = await arquivosJs('public/js');
  assert.ok(arquivos.length > 0);
  assert.deepEqual(await ocorrencias(arquivos, /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write\s*\(/), []);
});

test('pacote de domínio é puro: sem DOM, armazenamento, rede ou módulos do Node', async () => {
  const arquivos = await arquivosJs('public/js/dominio');
  assert.ok(arquivos.length >= 8);
  const proibido = /\b(document|window|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest)\b|from\s+['"]node:/;
  assert.deepEqual(await ocorrencias(arquivos, proibido), []);
});

test('nenhum código novo usa localStorage além do repositório do protótipo', async () => {
  const arquivos = (await arquivosJs('public/js')).filter((a) => !a.endsWith(`${sep}repositorio.js`) && !a.endsWith(`${sep}app.js`));
  assert.deepEqual(await ocorrencias(arquivos, /\blocalStorage\b/), []);
});

test('servidor e API não registram dados de requisição com console.log', async () => {
  const arquivos = await arquivosJs('src');
  const achados = (await ocorrencias(arquivos, /console\.log\(/)).filter((l) => !l.includes('Servidor em http'));
  assert.deepEqual(achados, []);
});
