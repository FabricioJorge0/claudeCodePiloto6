// Validação das entidades de fiscalização (modelo inicial da seção 3 do plano).
// Os campos são GENÉRICOS. Os campos obrigatórios de cada documento oficial
// dependem dos modelos da SEMA e da Procuradoria (A VALIDAR, perguntas P10 a P15).

import { carValido, identificarDocumento } from './documentos.js';
import { estadoVistoriaValido } from './estados.js';
import { uuidValido } from './ids.js';
import { sha256Valido } from './integridade.js';
import { dataHoraValida } from './relogio.js';
import { tipoDocumentoValido } from './talonario.js';

export const TIPOS_MIDIA = ['foto', 'video', 'audio'];
export const PRECISAO_GPS_MAXIMA_M = 10_000;

function texto(valor, min, max) {
  return typeof valor === 'string' && valor.trim().length >= min && valor.trim().length <= max;
}

function numeroEntre(valor, min, max) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max;
}

function objeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

// Coordenadas em graus decimais (WGS 84 vindo do GPS; datum gravado no registro)
function validarPosicao(dados, erros, { obrigatoria = true } = {}) {
  const informada = dados.latitude !== undefined || dados.longitude !== undefined;
  if (!informada) {
    if (obrigatoria) erros.push('Localização (latitude e longitude) é obrigatória');
    return;
  }
  if (!numeroEntre(dados.latitude, -90, 90)) erros.push('Latitude inválida');
  if (!numeroEntre(dados.longitude, -180, 180)) erros.push('Longitude inválida');
  if (!numeroEntre(dados.precisaoM, 0, PRECISAO_GPS_MAXIMA_M)) erros.push('Precisão do GPS (m) inválida');
}

export function validarVistoria(dados, { parcial = false } = {}) {
  const erros = [];
  if (!objeto(dados)) return { valida: false, erros: ['Dados da vistoria ausentes'] };
  const exigir = (campo) => !parcial || dados[campo] !== undefined;

  if (exigir('estado') && !estadoVistoriaValido(dados.estado)) erros.push('Estado da vistoria inválido');
  if (exigir('iniciadaEm') && !dataHoraValida(dados.iniciadaEm)) erros.push('Início da vistoria deve ter data, hora e fuso');
  if (exigir('descricao') && !texto(dados.descricao, 3, 5000)) erros.push('Descrição deve ter entre 3 e 5000 caracteres');
  if (dados.ordemId !== undefined && dados.ordemId !== null && !uuidValido(dados.ordemId)) erros.push('Ordem de fiscalização inválida');
  if (!parcial || dados.latitude !== undefined || dados.longitude !== undefined) validarPosicao(dados, erros);
  return { valida: erros.length === 0, erros };
}

export function validarEvidencia(dados) {
  const erros = [];
  if (!objeto(dados)) return { valida: false, erros: ['Dados da evidência ausentes'] };
  if (!uuidValido(dados.vistoriaId)) erros.push('Vistoria da evidência inválida');
  if (!TIPOS_MIDIA.includes(dados.tipoMidia)) erros.push('Tipo de mídia inválido');
  if (!sha256Valido(dados.sha256)) erros.push('Hash SHA-256 da evidência ausente ou inválido');
  if (!Number.isSafeInteger(dados.tamanhoBytes) || dados.tamanhoBytes <= 0) erros.push('Tamanho do arquivo inválido');
  if (!dataHoraValida(dados.capturadaEm)) erros.push('Data e hora da captura devem ter fuso');
  if (typeof dados.localizacaoSimulada !== 'boolean') erros.push('Indicador de localização simulada é obrigatório');
  validarPosicao(dados, erros);
  return { valida: erros.length === 0, erros };
}

export function validarPessoa(dados, { parcial = false } = {}) {
  const erros = [];
  if (!objeto(dados)) return { valida: false, erros: ['Dados da pessoa ausentes'] };
  if ((!parcial || dados.nome !== undefined) && !texto(dados.nome, 2, 200)) erros.push('Nome deve ter entre 2 e 200 caracteres');
  if ((!parcial || dados.documento !== undefined) && !identificarDocumento(dados.documento)) erros.push('CPF ou CNPJ inválido');
  if (dados.car !== undefined && dados.car !== null && !carValido(dados.car)) erros.push('Número do CAR inválido');
  return { valida: erros.length === 0, erros };
}

export function validarDocumentoFiscalizacao(dados) {
  const erros = [];
  if (!objeto(dados)) return { valida: false, erros: ['Dados do documento ausentes'] };
  if (!tipoDocumentoValido(dados.tipo)) erros.push('Tipo de documento inválido');
  if (!Number.isSafeInteger(dados.numero) || dados.numero <= 0) erros.push('Número do documento inválido');
  if (!uuidValido(dados.vistoriaId)) erros.push('Vistoria do documento inválida');
  if (!uuidValido(dados.pessoaId)) erros.push('Autuado/interessado do documento inválido');
  if (!dataHoraValida(dados.lavradoEm)) erros.push('Data e hora da lavratura devem ter fuso');
  if (!sha256Valido(dados.sha256Conteudo)) erros.push('Hash do conteúdo do documento ausente ou inválido');
  if (dados.cancelamento !== undefined) erros.push('Cancelamento só pode ser registrado pela operação "cancelar"');
  return { valida: erros.length === 0, erros };
}
