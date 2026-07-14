# Driver do e2e de correcao automatica (goal correcao-sem-clique).
# Carrega o livro_runner.py REAL (fonte do repo) e substitui APENAS run_claude —
# a fronteira da chamada de LLM — por um stub roteirizado que age no disco
# conforme _stub-plano.json. TODO o resto (loop de fases, gates, marcadores,
# estado, recontagens) roda de verdade. Uso:
#   python e2e-correcao-driver.py <livro_runner.py> <projeto> [args do runner...]
import importlib.util
import json
import os
import sys


def main():
    runner_path, projeto = sys.argv[1], os.path.abspath(sys.argv[2])
    extra = sys.argv[3:]

    spec = importlib.util.spec_from_file_location("livro_runner", runner_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    plano_path = os.path.join(projeto, "_stub-plano.json")
    idx_path = os.path.join(projeto, "_stub-idx")

    def stub_run_claude(proj, prompt, args, modelo=None):
        try:
            with open(plano_path, "r", encoding="utf-8") as fh:
                plano = json.load(fh)
        except (OSError, ValueError):
            plano = []
        i = 0
        if os.path.exists(idx_path):
            with open(idx_path, "r", encoding="utf-8") as fh:
                i = int((fh.read() or "0").strip() or "0")
        acao = plano[i] if i < len(plano) else {}
        with open(idx_path, "w", encoding="utf-8") as fh:
            fh.write(str(i + 1))
        # Evidencia: registra o prompt que o runner montou (prova que a instrucao
        # de correcao do worker foi injetada no micro-loop).
        with open(os.path.join(projeto, "_stub-prompts.log"), "a", encoding="utf-8") as fh:
            fh.write("=== call {} ===\n{}\n".format(i, prompt))
        if acao.get("gravar"):
            alvo = os.path.join(projeto, acao["gravar"])
            os.makedirs(os.path.dirname(alvo), exist_ok=True)
            with open(alvo, "w", encoding="utf-8", newline="") as fh:
                fh.write(acao.get("conteudo", ""))
        if acao.get("tocar_ledger"):
            led = os.path.join(projeto, "estado", "estado-narrativo.md")
            os.makedirs(os.path.dirname(led), exist_ok=True)
            with open(led, "a", encoding="utf-8") as fh:
                fh.write("\n<!-- continuidade atualizada (call {}) -->\n".format(i))
        return 0, "stub ok (call {})".format(i), ""

    mod.run_claude = stub_run_claude
    sys.exit(mod.main(["--projeto", projeto] + extra))


main()
