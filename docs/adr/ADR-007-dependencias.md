# ADR-007 — Política de dependências

**Situação:** proposto.
**Data:** 2026-11-06

## Contexto

O protótipo seguia a regra "nenhuma dependência de execução em produção". O sistema real vai precisar de bibliotecas (por exemplo Capacitor, SQLCipher, Fastify e um driver do PostgreSQL), mas cada dependência aumenta o risco de cadeia de suprimentos.

## Decisão

1. Usar primeiro o que o Node oferece de forma nativa. A fundação usa `node:sqlite`, `node:crypto` e `node:http`, sem nenhum pacote novo.
2. Uma dependência nova de execução só entra com:
   - justificativa registrada em ADR;
   - **aprovação humana explícita**, registrada no relatório de governança;
   - versão fixada no lockfile;
   - licença compatível;
   - `npm audit` sem achados altos.
3. Bibliotecas de front-end ficam em cópia local (como o Leaflet em `public/vendor/`), com SRI conferido e licença no repositório.
4. Na CI (Fase 1): SBOM (CycloneDX), auditoria de licenças e atualizações automáticas revisadas.

## Consequências

- A fundação continua com zero dependências de execução.
- A troca prevista para Fastify e PostgreSQL (plano, seção 2.2) exige uma nova aprovação.
