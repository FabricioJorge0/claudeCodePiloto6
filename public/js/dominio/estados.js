// Máquina de estados da vistoria (seção 5.3 do plano: o servidor é a autoridade).
// Os nomes e as transições são uma proposta inicial, a validar com a área de fiscalização.

export const ESTADOS_VISTORIA = [
  'rascunho', 'concluida_campo', 'recebida', 'em_conferencia', 'devolvida', 'homologada', 'cancelada'
];

export const ROTULOS_ESTADO_VISTORIA = {
  rascunho: 'Rascunho',
  concluida_campo: 'Concluída em campo',
  recebida: 'Recebida',
  em_conferencia: 'Em conferência',
  devolvida: 'Devolvida ao fiscal',
  homologada: 'Homologada',
  cancelada: 'Cancelada'
};

// [de, para, perfis que podem fazer a transição]
const TRANSICOES = [
  ['rascunho', 'concluida_campo', ['fiscal']],
  ['concluida_campo', 'recebida', ['sistema']],
  ['recebida', 'em_conferencia', ['conferente']],
  ['em_conferencia', 'devolvida', ['conferente']],
  ['em_conferencia', 'homologada', ['conferente']],
  ['devolvida', 'concluida_campo', ['fiscal']],
  ['rascunho', 'cancelada', ['fiscal']],
  ['concluida_campo', 'cancelada', ['fiscal']],
  ['devolvida', 'cancelada', ['fiscal']]
];

// Estados que só o fiscal autor altera (o rascunho tem um único dono)
export const ESTADOS_EDITAVEIS_EM_CAMPO = ['rascunho', 'devolvida'];

export function estadoVistoriaValido(estado) {
  return ESTADOS_VISTORIA.includes(estado);
}

export function transicoesPossiveis(de, perfil) {
  return TRANSICOES.filter(([origem, , perfis]) => origem === de && perfis.includes(perfil)).map(([, destino]) => destino);
}

export function validarTransicao(de, para, perfil) {
  if (!estadoVistoriaValido(de) || !estadoVistoriaValido(para)) {
    return { valida: false, motivo: 'Estado desconhecido' };
  }
  if (de === para) return { valida: true, motivo: null };
  const regra = TRANSICOES.find(([origem, destino]) => origem === de && destino === para);
  if (!regra) return { valida: false, motivo: `Transição não permitida: ${de} → ${para}` };
  if (!regra[2].includes(perfil)) {
    return { valida: false, motivo: `Perfil "${perfil}" não pode fazer a transição ${de} → ${para}` };
  }
  return { valida: true, motivo: null };
}
