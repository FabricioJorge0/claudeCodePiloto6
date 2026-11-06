# ADR-003 — Sincronização: outbox, idempotência e política de conflitos

**Situação:** proposto, implementado na fundação (branch `feat/fiscalizacao-fundacao`). Precisa de validação da área de fiscalização quanto aos estados e às regras de conflito.
**Data:** 2026-11-06

## Contexto

Os fiscais trabalham dias sem internet e sincronizam ao chegar à rede da SEMA. Qualquer registro de campo perdido ou duplicado compromete o processo. O protótipo usava IDs sequenciais (`proximoId`), que colidem entre aparelhos, e não tinha metadados de versão.

## Decisão

1. **Identificadores** UUID v7 gerados no aparelho (`public/js/dominio/ids.js`) para entidades e operações.
2. **Outbox**: cada alteração local gera uma operação `{ opId, entidade, entidadeId, tipo, versaoEsquema, criadaEm, payload, versaoBase? }` (`criarOperacao`). O contrato é o mesmo no aparelho e na API (`public/js/dominio/sincronizacao.js`).
3. **Idempotência**: a API grava o resultado de cada `opId` em `operacoes_recebidas`. Reenviar devolve o mesmo resultado com `duplicada: true`. O mesmo `opId` vindo de outro aparelho é rejeitado.
4. **Transação por operação**: aplicação, auditoria e registro de idempotência são gravados juntos (`src/api/sincronizacao.js`). Uma operação recusada não afeta as outras do lote.
5. **Resultados**: `aceita`, `rejeitada` (definitivo, vai para a quarentena no aparelho), `conflito` (definitivo, exige ação humana) e `adiada` (dependência ainda não chegou; não é gravada e o aparelho reenvia).
6. **Política por tipo de dado** (seção 5.3 do plano):

   | Entidade | Operações | Regra |
   |---|---|---|
   | evidencia | criar | Somente inclusão, hash SHA-256 obrigatório |
   | documento | criar, cancelar | Imutável; cancelamento é acrescentado; número nunca é liberado |
   | vistoria | criar, atualizar, excluir | Só o fiscal e o aparelho autores editam; `versaoBase` deve bater; estados pela máquina de estados (`estados.js`); exclusão lógica só em rascunho |
   | pessoa | criar, atualizar | `versaoBase` deve bater (mescla por campo com revisão: Fase 2) |

7. **Relógio**: o lote leva `horaAparelho`. A API calcula o desvio e o grava na auditoria e na resposta; o desvio acima de 5 min é marcado, nunca corrigido.
8. **Download** por cursor (`seq` da auditoria): o fiscal recebe só o que criou; conferente, gestor e auditor recebem tudo.
9. **Versão de esquema**: a API aceita `VERSOES_ESQUEMA_ACEITAS` (hoje só `1`; política futura N e N-1).

## Consequências

- Reenviar é sempre seguro, o que permite retomada após queda de conexão.
- Conflitos ficam visíveis em vez de serem resolvidos em silêncio. Isso exige telas de tratamento (backlog H14 e H16).
- **Pendências**: upload de mídia em partes com retomada (o lote leva só os metadados e o hash da evidência), mescla por campo para `pessoa`, transições feitas pelo conferente e pelo sistema (`recebida`, `em_conferencia`) e exportação de pacote cifrado (plano B).
