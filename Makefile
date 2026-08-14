.PHONY: preview

preview:
	QUARTO_PYTHON="$$(uv run python -c 'import sys; print(sys.executable)')" quarto preview
