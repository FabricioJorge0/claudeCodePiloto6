# Registros de Decisão de Arquitetura (ADRs)

Formato: contexto, decisão, consequências e situação. Uma decisão aceita não é editada; se mudar, um novo ADR a substitui.

| ADR | Tema | Situação |
|---|---|---|
| ADR-001 | App de campo: Capacitor vs. PWA | Pendente (spike S1, Fase 0) |
| ADR-002 | Armazenamento local no aparelho (SQLite + SQLCipher) | Pendente (spike S1) |
| [ADR-003](ADR-003-sincronizacao.md) | Sincronização: outbox, idempotência e política de conflitos | Proposto (implementado na fundação) |
| [ADR-004](ADR-004-numeracao.md) | Numeração de documentos por blocos reservados por aparelho | Proposto (depende da Procuradoria) |
| ADR-005 | Hospedagem e infraestrutura | Pendente (TI da SEMA) |
| ADR-006 | Geoespacial: SRC, mapa base e camadas offline | Pendente |
| [ADR-007](ADR-007-dependencias.md) | Política de dependências | Proposto |
| ADR-008 | Autenticação (OIDC com o IdP do Estado), sessão offline e perfis | Pendente (IdP A VALIDAR) |
| ADR-009 | Assinatura e ciência | Pendente (Procuradoria) |
| ADR-010 | Framework de UI | Pendente |
| [ADR-011](ADR-011-sqlite-interino.md) | SQLite (node:sqlite) como banco interino da API | Aceito para a fundação |

Os números seguem a seção 8.1 do [PLANO_EVOLUCAO_SEMA.md](../PLANO_EVOLUCAO_SEMA.md); o ADR-011 foi criado na implementação da fundação.
