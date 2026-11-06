// Rotas HTTP da API de fiscalização (/api/...).
// Autenticação provisória por token (Bearer) com credenciais injetadas. Em produção,
// será substituída por OIDC com o IdP do Estado (ADR-008, A VALIDAR); a interface
// autenticar(req) → { ator, perfil } continua a mesma.

import { createHash, timingSafeEqual } from 'node:crypto';

import { uuidValido } from '../../public/js/dominio/ids.js';
import { verificarAuditoria } from './banco.js';
import { listarAlteracoes, processarLote } from './sincronizacao.js';
import { ErroTalonario, inutilizarBlocos, listarBlocos, reservarBloco } from './talonario.js';

export const LIMITE_CORPO_BYTES = 1024 * 1024;
export const PERFIS = ['fiscal', 'conferente', 'gestor', 'auditor', 'administrador'];

class ErroHttp extends Error {
  constructor(status, mensagem, extras = {}) {
    super(mensagem);
    this.status = status;
    this.extras = extras;
  }
}

function resumo(token) {
  return createHash('sha256').update(String(token), 'utf8').digest();
}

// credenciais: { "<token>": { ator, perfil } }. Comparação em tempo constante.
export function criarAutenticador(credenciais = {}) {
  const lista = Object.entries(credenciais).map(([token, usuario]) => {
    if (!PERFIS.includes(usuario?.perfil) || typeof usuario?.ator !== 'string' || usuario.ator.trim() === '') {
      throw new Error(`Credencial inválida para o ator "${usuario?.ator}"`);
    }
    if (String(token).length < 16) throw new Error('Token deve ter ao menos 16 caracteres');
    return { resumo: resumo(token), usuario: { ator: usuario.ator, perfil: usuario.perfil } };
  });

  return function autenticar(req) {
    const cabecalho = req.headers.authorization ?? '';
    const [esquema, token] = cabecalho.split(' ');
    if (esquema !== 'Bearer' || !token) return null;
    const recebido = resumo(token);
    let encontrado = null;
    for (const item of lista) {
      if (timingSafeEqual(item.resumo, recebido)) encontrado = item.usuario;
    }
    return encontrado;
  };
}

async function lerJson(req) {
  const tipo = req.headers['content-type'] ?? '';
  if (!/^application\/json\s*(;|$)/i.test(tipo)) throw new ErroHttp(415, 'Envie Content-Type: application/json');
  const declarado = Number(req.headers['content-length']);
  if (Number.isFinite(declarado) && declarado > LIMITE_CORPO_BYTES) throw new ErroHttp(413, 'Corpo da requisição grande demais');

  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > LIMITE_CORPO_BYTES) throw new ErroHttp(413, 'Corpo da requisição grande demais');
    partes.push(parte);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    throw new ErroHttp(400, 'JSON inválido');
  }
}

function exigirPerfil(usuario, perfis) {
  if (!perfis.includes(usuario.perfil)) throw new ErroHttp(403, 'Perfil sem permissão para esta operação');
}

function exigirDispositivo(req) {
  const id = req.headers['x-dispositivo-id'];
  if (!uuidValido(id)) throw new ErroHttp(400, 'Cabeçalho X-Dispositivo-Id deve ser um UUID');
  return id;
}

function inteiroDaConsulta(url, nome, padrao, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const bruto = url.searchParams.get(nome);
  if (bruto === null || bruto === '') return padrao;
  const valor = Number(bruto);
  if (!Number.isSafeInteger(valor) || valor < min || valor > max) throw new ErroHttp(400, `Parâmetro "${nome}" inválido`);
  return valor;
}

// Tabela de rotas: "MÉTODO caminho" → { perfis, dispositivo, corpo, executar }
const ROTAS = {
  'POST /api/sync/lote': {
    perfis: ['fiscal'],
    dispositivo: true,
    corpo: true,
    executar: ({ db, corpo, ctx, agora }) => {
      const resposta = processarLote(db, corpo, ctx, { agora });
      if (!resposta.ok) throw new ErroHttp(400, 'Lote inválido', { erros: resposta.erros });
      const { ok, ...dados } = resposta;
      return dados;
    }
  },
  'GET /api/sync/alteracoes': {
    perfis: ['fiscal', 'conferente', 'gestor', 'auditor'],
    dispositivo: true,
    executar: ({ db, url, ctx }) => listarAlteracoes(db, {
      desde: inteiroDaConsulta(url, 'desde', 0),
      limite: inteiroDaConsulta(url, 'limite', 200, { min: 1, max: 500 })
    }, ctx)
  },
  'POST /api/talonario/blocos': {
    perfis: ['fiscal'],
    dispositivo: true,
    corpo: true,
    status: 201,
    executar: ({ db, corpo, ctx, agora }) => reservarBloco(db, { tipo: corpo?.tipo, tamanho: corpo?.tamanho }, ctx, { agora })
  },
  'GET /api/talonario/blocos': {
    perfis: ['fiscal'],
    dispositivo: true,
    executar: ({ db, ctx }) => ({ blocos: listarBlocos(db, ctx.dispositivoId) })
  },
  'POST /api/talonario/inutilizacoes': {
    perfis: ['administrador'],
    corpo: true,
    executar: ({ db, corpo, ctx, agora }) => {
      if (!uuidValido(corpo?.dispositivoId)) throw new ErroHttp(400, 'dispositivoId deve ser um UUID');
      return inutilizarBlocos(db, { dispositivoId: corpo.dispositivoId, motivo: corpo.motivo }, ctx, { agora });
    }
  },
  'GET /api/auditoria/verificacao': {
    perfis: ['auditor'],
    executar: ({ db }) => verificarAuditoria(db)
  }
};

const CAMINHOS = new Set(Object.keys(ROTAS).map((r) => r.split(' ')[1]));

// enviarJson vem do servidor, para manter os mesmos cabeçalhos de segurança
export function criarApi({ db, credenciais, agora = () => new Date().toISOString(), registrarErro = console.error }) {
  const autenticar = criarAutenticador(credenciais);

  return async function tratar(req, res, url, enviarJson) {
    const responder = (status, dados, cabecalhos = {}) => enviarJson(res, status, dados, { 'Cache-Control': 'no-store', ...cabecalhos });
    try {
      const rota = ROTAS[`${req.method} ${url.pathname}`];
      if (!rota) {
        if (CAMINHOS.has(url.pathname)) {
          const permitidos = Object.keys(ROTAS).filter((r) => r.endsWith(` ${url.pathname}`)).map((r) => r.split(' ')[0]);
          throw new ErroHttp(405, 'Método não permitido', { cabecalhos: { Allow: permitidos.join(', ') } });
        }
        throw new ErroHttp(404, 'Não encontrado');
      }

      const usuario = autenticar(req);
      if (!usuario) throw new ErroHttp(401, 'Autenticação necessária', { cabecalhos: { 'WWW-Authenticate': 'Bearer' } });
      exigirPerfil(usuario, rota.perfis);

      const ctx = { ...usuario, dispositivoId: rota.dispositivo ? exigirDispositivo(req) : (req.headers['x-dispositivo-id'] ?? null) };
      const corpo = rota.corpo ? await lerJson(req) : undefined;
      const dados = rota.executar({ db, url, corpo, ctx, agora });
      return responder(rota.status ?? 200, dados);
    } catch (erro) {
      if (erro instanceof ErroHttp) {
        const { cabecalhos, ...extras } = erro.extras;
        return responder(erro.status, { erro: erro.message, ...extras }, cabecalhos);
      }
      if (erro instanceof ErroTalonario) return responder(400, { erro: erro.message });
      // Sem detalhes internos na resposta; o log fica no servidor
      registrarErro(JSON.stringify({ nivel: 'erro', rota: url.pathname, mensagem: erro?.message }));
      return responder(500, { erro: 'Erro interno' });
    }
  };
}
