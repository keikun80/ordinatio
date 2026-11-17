# ==============================================================================
# Ordinatio Root Makefile
# Automatically forwards all targets to ordinatio/Makefile
# ==============================================================================

ORDINATIO_DIR := ordinatio

.DEFAULT_GOAL := help

.PHONY: help
help:
	@$(MAKE) --no-print-directory -C $(ORDINATIO_DIR) help

%:
	@$(MAKE) --no-print-directory -C $(ORDINATIO_DIR) $@
