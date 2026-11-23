#!/usr/bin/env python3
"""Gera um HTML único (abre com duplo clique, sem servidor) com CSS, JS e dados embutidos.
Uso: python3 -I scripts/build_single.py [saida.html]   (inclui data/base.json se existir)"""
import json, os, re, sys
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'grandes-contas')
rd = lambda p: open(os.path.join(G, p), encoding='utf-8').read()
out = sys.argv[1] if len(sys.argv) > 1 else 'grandes-contas-360.html'

def strip_imports(s): return re.sub(r"^import .*?;\n", '', s, flags=re.M)
def unexport(s): return re.sub(r"^export (const|function|async function) ", r"\1 ", s, flags=re.M)
cfg = unexport(strip_imports(rd('js/config.js')))
eng = unexport(strip_imports(rd('js/engine.js')))
imp = unexport(strip_imports(rd('js/importer.js')))
app = strip_imports(rd('js/app.js'))
app = app.replace("async function carregar(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }",
                  "async function carregar(url) { if (!(url in window.__DATA__)) throw new Error(url + ' ausente'); return window.__DATA__[url]; }")
assert '__DATA__' in app
data = {}
for f in ('catalogo', 'demo', 'base'):
    p = os.path.join(G, 'data', f + '.json')
    if os.path.exists(p): data[f'data/{f}.json'] = json.load(open(p, encoding='utf-8'))
js = (cfg + "\nconst E = (() => {\n" + eng +
      "\nreturn { indexar, comprasNoPeriodo, localizarReferencia, perfil, statusCliente, classificar, VISOES, passaVisao, produtosDaCaixa, filtrarCatalogo, indicadores };\n})();\n"
      "const { importarCadastro, importarVendas } = (() => {\n" + imp + "\nreturn { importarCadastro, importarVendas };\n})();\n" + app)
html = rd('index.html')
html = re.sub(r'<link rel="stylesheet" href="css/style.css">', lambda m: '<style>' + rd('css/style.css') + '</style>', html)
import base64
for img in ('ativa', 'eurotecnica'):
    b = base64.b64encode(open(os.path.join(G, 'assets', img + '.png'), 'rb').read()).decode()
    html = html.replace(f'assets/{img}.png', 'data:image/png;base64,' + b)
blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = html.replace('<script type="module" src="js/app.js"></script>',
                    '<script>window.__DATA__=' + blob + ';</script>\n<script type="module">\n' + js + '\n</script>')
open(out, 'w', encoding='utf-8').write(html)
print(out, round(len(html) / 1e6, 2), 'MB; dados:', list(data))
