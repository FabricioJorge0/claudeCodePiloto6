import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projetos as dadosFicticios } from './data/projetos.js';
import { buscarProjeto, listarProjetos, resumoPorStatus } from './projetos.js';

const PASTA_PUBLICA = resolve(fileURLToPath(new URL('../public', import.meta.url)));

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const CABECALHOS_SEGURANCA = {
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
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

export function criarServidor({ projetos = dadosFicticios } = {}) {
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
    const { pathname, searchParams } = url;

    if (pathname === '/health') {
      return enviarJson(res, 200, { status: 'ok' });
    }

    if (pathname === '/api/projetos') {
      try {
        const status = searchParams.get('status') ?? undefined;
        return enviarJson(res, 200, listarProjetos(projetos, { status }));
      } catch (erro) {
        return enviarJson(res, 400, { erro: erro.message });
      }
    }

    const matchId = pathname.match(/^\/api\/projetos\/([^/]+)$/);
    if (matchId) {
      const projeto = buscarProjeto(projetos, matchId[1]);
      return projeto
        ? enviarJson(res, 200, projeto)
        : enviarJson(res, 404, { erro: 'Projeto não encontrado' });
    }

    if (pathname === '/api/resumo') {
      return enviarJson(res, 200, resumoPorStatus(projetos));
    }

    if (pathname.startsWith('/api/')) {
      return enviarJson(res, 404, { erro: 'Rota não encontrada' });
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
