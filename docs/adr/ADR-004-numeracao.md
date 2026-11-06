# ADR-004 — Numeração de documentos por blocos reservados por aparelho

**Situação:** proposto. A mecânica está implementada na fundação; o formato oficial do número e a aceitação jurídica são **A VALIDAR** (perguntas P12 e P13 do plano).
**Data:** 2026-11-06

## Contexto

Autos e termos precisam de numeração única. Offline, o aparelho não pode consultar o servidor para obter o próximo número.

## Decisão

- O aparelho pede um bloco por tipo de documento enquanto está online (`POST /api/talonario/blocos`). A API reserva a próxima faixa livre em transação `BEGIN IMMEDIATE`, então dois aparelhos nunca recebem a mesma faixa.
- Offline, o aparelho consome os números em ordem (`proximoNumero`, `precisaNovoBloco` em `public/js/dominio/talonario.js`).
- Na sincronização, a API confere se o número pertence a um bloco **daquele aparelho**, se o bloco não foi inutilizado e se o número não foi usado (`numeros_usados`, chave primária `(tipo, numero)`). Números usados nunca são liberados, nem por cancelamento; um gatilho impede `DELETE`.
- Aparelho perdido ou trocado: o administrador inutiliza os blocos (`POST /api/talonario/inutilizacoes`), com motivo registrado na auditoria.

## Consequências

- Não há colisão de numeração entre aparelhos offline.
- Haverá "buracos" na sequência (blocos não usados ou inutilizados), o que precisa ser aceito juridicamente e explicado nos relatórios.
- **Pendências**: formato oficial (prefixo, ano, unidade), número provisório de contingência e relatório de uso do talonário.
