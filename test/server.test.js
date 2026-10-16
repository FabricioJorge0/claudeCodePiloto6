import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

import { criarServidor } from '../src/server.js';

let servidor;
let porta;

before(async () => {
  servidor = criarServidor();
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  porta = servidor.address().port;
});

after(() => new Promise((ok) => servidor.close(ok)));

// Requisição "crua": envia o caminho exatamente como escrito,
// sem a normalização que o fetch faria (necessário para testar path traversal).
function requisitar(caminho, { method = 'GET' } = {}) {
  return new Promise((ok, falha) => {
    const req = request({ host: '127.0.0.1', port: porta, path: caminho, method }, (res) => {
      let corpo = '';
      res.setEncoding('utf8');
      res.on('data', (parte) => { corpo += parte; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, corpo }));
    });
    req.on('error', falha);
    req.end();
  });
}

describe('servidor', () => {
  test('GET /health responde ok', async () => {
    const res = await requisitar('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.corpo), { status: 'ok' });
  });

  test('GET / entrega o index.html', async () => {
    const res = await requisitar('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.match(res.corpo, /Governança de Projetos Ambientais/);
  });

  test('entrega CSS e módulos JS com o tipo correto', async () => {
    const css = await requisitar('/styles.css');
    assert.equal(css.status, 200);
    assert.match(css.headers['content-type'], /^text\/css/);

    for (const arquivo of ['/js/app.js', '/js/projetos.js', '/js/repositorio.js', '/js/dados-exemplo.js', '/js/clima.js', '/js/mapa.js']) {
      const js = await requisitar(arquivo);
      assert.equal(js.status, 200, arquivo);
      assert.match(js.headers['content-type'], /^text\/javascript/, arquivo);
    }
  });

  test('entrega a cópia local do Leaflet (script, estilo e ícones PNG)', async () => {
    const tipos = {
      '/vendor/leaflet/leaflet.js': /^text\/javascript/,
      '/vendor/leaflet/leaflet.css': /^text\/css/,
      '/vendor/leaflet/images/marker-icon.png': /^image\/png$/,
      '/vendor/leaflet/images/marker-shadow.png': /^image\/png$/
    };
    for (const [arquivo, tipo] of Object.entries(tipos)) {
      const res = await requisitar(arquivo);
      assert.equal(res.status, 200, arquivo);
      assert.match(res.headers['content-type'], tipo, arquivo);
    }
  });

  test('arquivo inexistente retorna 404', async () => {
    const res = await requisitar('/nao-existe.html');
    assert.equal(res.status, 404);
  });

  test('não existe API de dados (tudo fica no localStorage)', async () => {
    const res = await requisitar('/api/projetos');
    assert.equal(res.status, 404);
  });

  test('HEAD é permitido', async () => {
    const res = await requisitar('/', { method: 'HEAD' });
    assert.equal(res.status, 200);
  });

  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    test(`${method} retorna 405 com cabeçalho Allow`, async () => {
      const res = await requisitar('/', { method });
      assert.equal(res.status, 405);
      assert.equal(res.headers.allow, 'GET, HEAD');
    });
  }
});

describe('segurança', () => {
  test('cabeçalhos de segurança presentes em respostas 200, 404 e 405', async () => {
    const respostas = await Promise.all([
      requisitar('/'),
      requisitar('/nao-existe'),
      requisitar('/', { method: 'POST' })
    ]);
    for (const res of respostas) {
      assert.match(res.headers['content-security-policy'], /default-src 'self'/);
      assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    }
  });

  test('CSP libera só o necessário para mapa e clima', async () => {
    const csp = (await requisitar('/')).headers['content-security-policy'];
    const diretivas = Object.fromEntries(csp.split(';').map((d) => {
      const [nome, ...valores] = d.trim().split(/\s+/);
      return [nome, valores];
    }));
    // Scripts e estilos: só do próprio site (sem CDN, sem inline)
    assert.equal(diretivas['script-src'], undefined);
    assert.equal(diretivas['style-src'], undefined);
    assert.deepEqual(diretivas['default-src'], ["'self'"]);
    assert.deepEqual(diretivas['img-src'], ["'self'", 'data:', 'https://tile.openstreetmap.org']);
    assert.deepEqual(diretivas['connect-src'], [
      "'self'", 'https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com'
    ]);
  });

  const tentativasTraversal = [
    '/../package.json',
    '/..%2fpackage.json',
    '/%2e%2e/package.json',
    '/%2e%2e%2fsrc%2fserver.js',
    '/js/..%2f..%2fpackage.json',
    '/..%5cpackage.json'
  ];

  for (const caminho of tentativasTraversal) {
    test(`bloqueia path traversal: ${caminho}`, async () => {
      const res = await requisitar(caminho);
      assert.ok([403, 404].includes(res.status), `status ${res.status}`);
      assert.doesNotMatch(res.corpo, /"name"\s*:\s*"governanca-projetos-ambientais"/);
      assert.doesNotMatch(res.corpo, /criarServidor/);
    });
  }

  test('URL com codificação malformada retorna 400', async () => {
    const res = await requisitar('/%E0%A4%A');
    assert.equal(res.status, 400);
  });

  test('byte nulo no caminho não quebra o servidor', async () => {
    const res = await requisitar('/index.html%00.js');
    assert.ok([400, 403, 404].includes(res.status), `status ${res.status}`);
    const saude = await requisitar('/health');
    assert.equal(saude.status, 200);
  });
});
