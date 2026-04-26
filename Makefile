# Argus — single entry point for the demo and the day-to-day workflow.
# Day 1 scaffolding. Targets fill in as their day arrives (see plan §13).

.DEFAULT_GOAL := help
SHELL := /bin/bash

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install all JS + Python deps (Tag 1)
	pnpm install
	cd python && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"

.PHONY: dev
dev: ## Run client + server + ml + redis locally (Tag 4+)
	@echo "TODO: wire up after Tag 4 — for now run services individually"

.PHONY: typecheck
typecheck: ## TS typecheck across all workspaces
	pnpm typecheck

.PHONY: lint
lint: ## ESLint + Stylelint
	pnpm lint
	pnpm lint:css

.PHONY: test
test: ## Run all unit tests (TS + Py)
	pnpm test
	cd python && . .venv/bin/activate && pytest

.PHONY: db.generate
db.generate: ## Drizzle → SQL into supabase/migrations (Tag 3)
	pnpm --filter @argus/server db:generate

.PHONY: db.push
db.push: ## Apply migrations + RLS to Supabase (Tag 3)
	@echo "TODO Tag 3: supabase db push"

.PHONY: seed
seed: ## Seed 10 demo POIs (Tag 14)
	@echo "TODO Tag 14: pnpm tsx scripts/seed.ts"

.PHONY: eval
eval: ## Run ROC + latency benchmarks (Tag 13)
	@echo "TODO Tag 13: python scripts/eval-roc.py && pnpm tsx scripts/benchmark-latency.ts"

.PHONY: demo
demo: install db.push seed ## End-to-end demo bring-up
	docker compose up -d redis ml
	pnpm dev

.PHONY: depcheck
depcheck: ## Fail on unused dependencies (anti-bloat gate)
	pnpm depcheck
