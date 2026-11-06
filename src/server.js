import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Entrega os arquivos estáticos (os projetos do protótipo ficam no localStorage do navegador).
// Opcionalmente, atende a API de fiscalização em /api (sincronização, talonário, auditoria),
// habilitada só quando um banco e credenciais são configurados (ver README).

const PASTA_PUBLICA = resolve(fileURLToPath(new URL('../public', import.meta.url)));

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Scripts e estilos só do próprio site (Leaflet está em /vendor). Exceções mínimas:
// imagens do mapa (OpenStreetMap) e chamadas às APIs do Open-Meteo (clima e localização).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://tile.openstreetmap.org",
  "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

const CABECALHOS_SEGURANCA = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Envia só a origem em requisições externas: os servidores de mapa do OpenStreetMap exigem o Referer
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function enviar(res, status, corpo, tipo, extras = {}) {
  res.writeHead(status, { ...extras, ...CABECALHOS_SEGURANCA, 'Content-Type': tipo });
  res.end(corpo);
}

function enviarJson(res, status, dados, extras = {}) {
  enviar(res, status, JSON.stringify(dados), TIPOS['.json'], extras);
}

async function servirEstatico(res, caminho) {
  const relativo = caminho === '/' ? 'index.html' : decodeURIComponent(caminho).replace(/^\/+/, '');
  const arquivo = resolve(PASTA_PUBLICA, normalize(relativo));

  // Bloqueia path traversal: o arquivo precisa estar dentro de public/
  if (!arquivo.startsWith(PASTA_PUBLICA + sep)) {
    return enviarJson(res, 403, { erro: 'Acesso negado' });
  }

  try {
    const conteudo = await readFile(arquivo);
    enviar(res, 200, conteudo, TIPOS[extname(arquivo)] ?? 'application/octet-stream');
  } catch {
    enviarJson(res, 404, { erro: 'Não encontrado' });
  }
}

// api: função criada por criarApi (src/api/rotas.js). Sem ela, /api responde 404.
export function criarServidor({ api } = {}) {
  return createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return enviarJson(res, 400, { erro: 'Requisição inválida' });
    }
    const { pathname } = url;

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      if (!api) return enviarJson(res, 404, { erro: 'API não habilitada neste servidor' });
      return api(req, res, url, enviarJson);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return enviarJson(res, 405, { erro: 'Método não permitido' });
    }

    if (pathname === '/health') {
      return enviarJson(res, 200, { status: 'ok' });
    }

    try {
      return await servirEstatico(res, pathname);
    } catch {
      return enviarJson(res, 400, { erro: 'Requisição inválida' });
    }
  });
}

// Executa o servidor apenas quando chamado diretamente (npm start),
// não quando importado pelos testes.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const porta = Number(process.env.PORT) || 3000;
  const api = await apiDoAmbiente(process.env);
  criarServidor({ api }).listen(porta, () => {
    console.log(`Servidor em http://localhost:${porta}${api ? ' (API de fiscalização habilitada)' : ''}`);
  });
}

// A API só é habilitada com DB_PATH e API_CREDENCIAIS_ARQUIVO (JSON fora do repositório).
// Credenciais por token são PROVISÓRIAS e recusadas em produção (ADR-008).
export async function apiDoAmbiente(env) {
  if (!env.DB_PATH || !env.API_CREDENCIAIS_ARQUIVO) return undefined;
  if (env.NODE_ENV === 'production') {
    throw new Error('Credenciais por token são só para desenvolvimento e homologação (ADR-008)');
  }
  const [{ abrirBanco }, { criarApi }] = await Promise.all([import('./api/banco.js'), import('./api/rotas.js')]);
  const credenciais = JSON.parse(await readFile(env.API_CREDENCIAIS_ARQUIVO, 'utf8'));
  return criarApi({ db: abrirBanco(env.DB_PATH), credenciais });
}
