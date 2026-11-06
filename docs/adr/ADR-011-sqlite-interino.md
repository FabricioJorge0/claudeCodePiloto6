# ADR-011 — SQLite (node:sqlite) como banco interino da API

**Situação:** aceito para a fundação. Será substituído pelo ADR-005 (hospedagem) e pela migração para PostgreSQL + PostGIS.
**Data:** 2026-11-06

## Contexto

O humano escolheu implementar a fundação **sem instalar dependências**. O plano prevê PostgreSQL + PostGIS, o que exige um driver (dependência npm) e um servidor de banco.

## Decisão

- Usar `node:sqlite` (`DatabaseSync`), embutido no Node 22.13 ou superior, no servidor (`src/api/banco.js`).
- Manter a interface pequena para facilitar a troca: `abrirBanco`, `migrar`, `transacao`, `registrarAuditoria`, `verificarAuditoria`.
- Usar migrações numeradas (`MIGRACOES`), com recusa de banco em versão mais nova que a aplicação.
- Garantir a imutabilidade por gatilhos (auditoria somente inclusão; sem `DELETE` físico em entidades, números usados e registros de idempotência) e pela cadeia de hashes SHA-256 da auditoria, que detecta adulteração mesmo se os gatilhos forem removidos.

## Consequências

- **Não usar em produção.** SQLite com um único processo não atende várias instâncias da API nem consultas geoespaciais.
- `node:sqlite` ainda é experimental no Node: pode emitir aviso e mudar de API. Por isso a versão mínima do Node passou a ser 22.13.
- O mesmo motor (SQLite) será usado no aparelho (ADR-002). As migrações e as regras testadas aqui servem de referência para o banco local.
- **Migração para PostgreSQL**:
  - trocar `banco.js` e os SQLs;
  - substituir os gatilhos por permissões (`REVOKE UPDATE, DELETE`) e por gatilhos PL/pgSQL;
  - usar `SELECT … FOR UPDATE` ou `SERIALIZABLE` na reserva de blocos;
  - manter os testes de `test/api.test.js` como testes de contrato.
