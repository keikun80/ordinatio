# ==============================================================================
# AI Orchestrator Root Makefile
# Automatically forwards all targets to aiorche/Makefile
# ==============================================================================

AIORCHE_DIR := aiorche

.DEFAULT_GOAL := help

.PHONY: help
help:
	@$(MAKE) --no-print-directory -C $(AIORCHE_DIR) help

%:
	@$(MAKE) --no-print-directory -C $(AIORCHE_DIR) $@
