#!/usr/bin/env python3
"""Gera eurotecnica/index.html (dados embutidos) a partir das duas planilhas.
Uso: python3 build.py "Caixas.xlsx" "Vendas.xlsx"
"""
import sys, json, datetime, collections, os
import openpyxl

caixas_xlsx, vendas_xlsx = sys.argv[1], sys.argv[2]
estoque_xlsx = sys.argv[3] if len(sys.argv) > 3 else None
here = os.path.dirname(os.path.abspath(__file__))
SKIP = {'Análise Caixas', 'Lista', 'Cadastro Padre Cícero'}

def s(x): return '' if x is None else str(x).strip()

wb = openpyxl.load_workbook(caixas_xlsx, data_only=True, read_only=True)
lista = {}
for r in wb['Lista'].iter_rows(min_row=2, values_only=True):
    if r and r[0]: lista[s(r[0])] = r
pc = {}
for r in wb['Cadastro Padre Cícero'].iter_rows(min_row=2, values_only=True):
    if r and r[0]: pc[s(r[0])] = (s(r[1]).replace('.0', ''), s(r[2]), s(r[3]))

# montadora de cada caixa (aba "Análise Caixas": montadora aparece só na 1ª linha do bloco)
mont = {}; cur = ''
for r in wb['Análise Caixas'].iter_rows(min_row=13, values_only=True):
    if r[1]: cur = s(r[1])
    if r[2] and r[1] is not None or r[2]:
        if s(r[2]) and cur and s(r[2]) not in ('Caixa',): mont[s(r[2])] = cur

def qtd_aplicada(v, L):
    for x in (v, L[20] if L else None):   # aba da caixa; se vazio, a coluna "Qtd. Aplicada" da Lista
        try:
            n = float(str(x).replace(',', '.'))
            if n > 0: return int(n) if n == int(n) else n
        except (TypeError, ValueError):
            pass
    return 1

parts, pidx, caixas = [], {}, []
for ws in wb:
    if ws.title in SKIP: continue
    ids = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or not r[0]: continue
        cod = s(r[0])
        if cod not in pidx:
            L = lista.get(cod)
            preco = L[8] if L and isinstance(L[8], (int, float)) else None
            p = pc.get(cod)
            pidx[cod] = len(parts)
            parts.append([cod, s(r[4]) or (s(L[2]) if L else ''), s(r[3]) or (s(L[1]) if L else ''),
                          s(L[22]) if L else '', s(L[21]) if L else '', s(r[5]),
                          p[0] if p else (s(r[7]).replace('.0', '')), s(r[1]).replace('.0', ''),
                          preco, 1 if (L and L[8] == 'Venda Suspensa') else 0, qtd_aplicada(r[6], L)])
        ids.append(pidx[cod])
    caixas.append({'n': ws.title, 'm': mont.get(ws.title, 'OUTRAS'), 'p': sorted(set(ids))})

# vendas
ws = openpyxl.load_workbook(vendas_xlsx, read_only=True).active
rows = list(ws.iter_rows(values_only=True))
h = rows[0]; assert h[16] == 'Cliente' and h[23] == 'Nº peça fabricante', 'layout inesperado'
def dt(v):
    if isinstance(v, datetime.datetime): return v
    if isinstance(v, (int, float)): return datetime.datetime(1899, 12, 30) + datetime.timedelta(days=v)
    return None
cli, cidx, reps, ridx = [], {}, [], {}
agg = collections.defaultdict(lambda: [0, 0.0, 0])
tot = collections.defaultdict(float)
lastrep = {}
centro_uf = collections.defaultdict(collections.Counter)
vl = collections.defaultdict(lambda: [0.0] * 12)   # (peça, loja, ano) -> qtd vendida por mês
for r in rows[1:]:
    d = dt(r[15]); cod = s(r[23])
    if not d or not r[16]: continue
    c = s(r[16])
    rep = s(r[22]) or 'SEM VENDEDOR'
    if rep not in ridx: ridx[rep] = len(reps); reps.append(rep)
    if c not in cidx:
        cidx[c] = len(cli); cli.append([c, s(r[17]), s(r[25]).title(), s(r[27]), ridx[rep]])
    ci = cidx[c]
    if ci not in lastrep or d >= lastrep[ci][0]: lastrep[ci] = (d, ridx[rep]); cli[ci][4] = ridx[rep]
    centro_uf[s(r[1])][s(r[27])] += 1
    tk = (ci, d.strftime('%Y-%m')); tot[tk] += r[14] or 0   # faturamento total (todas as peças) p/ Plano de Negócio
    if cod not in pidx: continue
    vl[(pidx[cod], s(r[1]), d.year)][d.month - 1] += r[3] or 0
    k = (ci, pidx[cod], d.strftime('%Y-%m'))
    a = agg[k]; a[0] += r[3] or 0; a[1] += r[14] or 0; a[2] = max(a[2], (d - datetime.datetime(1899, 12, 30)).days)
V = [[k[0], k[1], k[2], round(a[0], 3), round(a[1], 2), a[2]] for k, a in agg.items()]
# distribuidores: cadastro (cód. da fábrica -> cód. do distribuidor). Só o Padre Cícero tem cadastro na planilha.
dpc = {}
for cod, (c, desc, sit) in pc.items():
    if cod in pidx: dpc[pidx[cod]] = [c, desc, sit]
D = [{'n': 'Padre Cícero', 'vendas': 1, 'c': dpc}]
if estoque_xlsx:  # estoque livre por loja (planilha "ESTOQUE_EUROTECNICA": Produto, Referencia, ..., Util.livre, Loja)
    ew = openpyxl.load_workbook(estoque_xlsx, read_only=True, data_only=True).active
    erows = list(ew.iter_rows(values_only=True))
    assert erows[0][1] == 'Referencia' and erows[0][5] == 'Loja', 'layout de estoque inesperado'
    E, lojas = {}, set()
    for r in erows[1:]:
        loja = s(r[5])
        if not loja: continue
        lojas.add(loja)
        pi = pidx.get(s(r[1]))
        if pi is not None and (r[4] or 0) > 0:
            E.setdefault(str(pi), {})[loja] = r[4]
    lj = json.load(open(os.path.join(here, 'lojas_padre_cicero.json'), encoding='utf-8'))   # nome e cidade das lojas (mesma lista do Cliente 360 da Rio)
    ano = max(k[2] for k in vl) if vl else None
    VL = {}
    for (pi, loja, y), meses in vl.items():
        if y == ano and any(meses): VL.setdefault(str(pi), {})[loja] = [round(x, 3) for x in meses]
    nm = max((i + 1 for m in VL.values() for ms in m.values() for i, x in enumerate(ms) if x), default=0)
    D[0].update({'lj': lj, 'vl': VL, 'nm': nm, 'e': E, 'lojas': sorted(lojas),
                 'cd': ['F004', 'F017', 'F019', 'F026', 'F031', 'F035', 'F038', 'F041', 'F043'],   # lojas Atacado/CD (mesma regra do Cliente 360 da Rio)
                 'uf': {k: v.most_common(1)[0][0] for k, v in centro_uf.items()}})
T = [[k[0], k[1], round(v, 2)] for k, v in tot.items()]
data = {'P': parts, 'CX': caixas, 'C': cli, 'R': reps, 'V': V, 'D': D, 'T': T}
tpl = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
out = tpl.replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
open(os.path.join(here, 'index.html'), 'w', encoding='utf-8').write(out)
print(len(parts), 'peças |', len(caixas), 'caixas |', len(cli), 'clientes |', len(V), 'linhas de venda |', len(out) // 1024, 'KB')
