import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Não há banco de dados nem API de dados: o servidor apenas entrega os
// arquivos estáticos. Os projetos ficam no localStorage do navegador.

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

function enviar(res, status, corpo, tipo) {
  res.writeHead(status, { ...CABECALHOS_SEGURANCA, 'Content-Type': tipo });
  res.end(corpo);
}

function enviarJson(res, status, dados) {
  enviar(res, status, JSON.stringify(dados), TIPOS['.json']);
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

export function criarServidor() {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return enviarJson(res, 405, { erro: 'Método não permitido' });
    }

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return enviarJson(res, 400, { erro: 'Requisição inválida' });
    }
    const { pathname } = url;

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
  criarServidor().listen(porta, () => {
    console.log(`Servidor em http://localhost:${porta}`);
  });
}
