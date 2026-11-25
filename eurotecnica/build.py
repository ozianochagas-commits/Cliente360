#!/usr/bin/env python3
"""Gera eurotecnica/index.html (dados embutidos) a partir das duas planilhas.
Uso: python3 build.py "Caixas.xlsx" "Vendas.xlsx"
"""
import sys, json, datetime, collections, os
import openpyxl

caixas_xlsx, vendas_xlsx = sys.argv[1], sys.argv[2]
estoque_xlsx = sys.argv[3] if len(sys.argv) > 3 else None
cadastro_xlsx = sys.argv[4] if len(sys.argv) > 4 else None
precos_xlsx = sys.argv[5] if len(sys.argv) > 5 else None   # lista de preços com Linha e Grupo (família): traz os itens que não estão em nenhuma caixa
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

# ---- foto de cada caixa: desenho explodido (página 1 do PDF do catálogo Eurotécnica), já convertido em fotos/<arquivo>.jpg
# O nome do arquivo é o do PDF; quando o PDF tem outro nome que a caixa deste sistema, o casamento é pelo "Conjunto" do PDF:
FOTO_ALIAS = {'16S-1900': '16S-190',                  # PDF "Conjunto: 16S 190"
              'G-330': 'G-281-330',                   # PDF "Conjunto: G 281/330-12"
              'GRSO-905': 'GRS-905',                  # PDF "GR / GRS / GRSO 905"
              'GRS-905R e GRSO-905R': 'GRS-905',      # versões com retarder: mesmo conjunto 905 (confirmar)
              'GRS-925': 'GRSO-925',                  # PDF "GRSO 925 / 925R" (confirmar)
              'GRSO-925 e GRSO-925R': 'GRSO-925'}
for c in caixas:
    for stem in (c['n'], FOTO_ALIAS.get(c['n'])):
        if stem and os.path.exists(os.path.join(here, 'fotos', stem + '.jpg')):
            c['f'] = 'fotos/' + stem + '.jpg'; break
print('caixas com foto:', sum(1 for c in caixas if c.get('f')), 'de', len(caixas), '| sem foto:', [c['n'] for c in caixas if not c.get('f')])

# ---- itens SEM caixa (lista de preços com família): cada Grupo vira uma família (botão "<Grupo>") na montadora FAMÍLIAS
def _grupo_canon(vals):
    c = collections.Counter(vals); best = {}
    for g, n in c.most_common():
        best.setdefault(g.casefold(), g)          # grafia mais comum de cada grupo (CÂMBIO -> Câmbio)
    return best
def _linha(v):
    v = ' '.join(s(v).split()).upper()
    return '/'.join(x.strip() for x in v.split('/')) if v else ''
if precos_xlsx:
    pw = openpyxl.load_workbook(precos_xlsx, read_only=True, data_only=True).active
    prow = list(pw.iter_rows(values_only=True))
    assert s(prow[1][0]).startswith('Nº Eurotecnica') and s(prow[1][21]) == 'Linha' and s(prow[1][22]) == 'Grupo', 'layout da lista de preços inesperado'
    prow = [r for r in prow[2:] if r and r[0]]
    canon = _grupo_canon([s(r[22]) for r in prow if s(r[22])])
    novos = collections.defaultdict(list); n_atual = 0
    for r in prow:
        cod = s(r[0]); grupo = canon.get(s(r[22]).casefold(), s(r[22])) or 'Outros'; linha = _linha(r[21])
        if cod in pidx:                        # peça de caixa: a lista de preços (mais nova) manda na Linha e no Grupo
            q = parts[pidx[cod]]; q[3] = grupo; q[4] = linha; n_atual += 1
            if s(r[23]): q[5] = ' '.join(s(r[23]).split())   # Aplicação da lista de preços (mais completa que a da aba da caixa)
            continue
        L = lista.get(cod); pcod = pc.get(cod)
        preco = r[8] if isinstance(r[8], (int, float)) else None
        pidx[cod] = len(parts)
        parts.append([cod, s(r[3]), (s(L[1]) if L else ''), grupo, linha, ' '.join(s(r[23]).split()), pcod[0] if pcod else '', s(r[4]).replace('.0', ''),
                      preco, 1 if s(r[8]).upper().startswith('VENDA SUSP') else 0, qtd_aplicada(r[20], None)])
        novos[grupo].append(pidx[cod])
    for g in sorted(novos): caixas.append({'n': g, 'm': 'FAMÍLIAS', 'p': sorted(novos[g])})   # itens sem caixa ficam só na família (Grupo)
    print('itens sem caixa acrescentados:', sum(len(v) for v in novos.values()), 'em', len(novos), 'famílias | peças de caixa atualizadas (Linha/Grupo):', n_atual)

# vendas
ws = openpyxl.load_workbook(vendas_xlsx, read_only=True).active
rows = list(ws.iter_rows(values_only=True))
h = rows[0]; assert h[16] == 'Cliente' and h[23] == 'Nº peça fabricante', 'layout inesperado'
def dt(v):
    if isinstance(v, datetime.datetime): return v
    if isinstance(v, (int, float)): return datetime.datetime(1899, 12, 30) + datetime.timedelta(days=v)
    return None
cli, cidx, reps, ridx = [], {}, [], {}
agg = collections.defaultdict(lambda: [0, 0.0, 0, 0.0])   # qtd líquida, valor, última data, qtd bruta comprada (sem devoluções)
# O "Nº peça fabricante" da venda nem sempre bate com o catálogo (ex.: venda 30001332-5, catálogo 30001332-4; ou dois códigos na mesma linha).
# Mesma regra do Excel das caixas (que busca pelos 8 primeiros dígitos): exato -> um dos códigos de "a/b" -> 8 primeiros dígitos (só se forem de uma peça só).
_pref = collections.defaultdict(set)
for _c in pidx: _pref[_c[:8]].add(_c)
def resolver_peca(cod):
    if cod in pidx: return pidx[cod], 'exato'
    for q in cod.replace(' ', '').split('/'):
        if q in pidx: return pidx[q], 'composto'
    cand = _pref.get(cod[:8])
    if cand and len(cand) == 1: return pidx[next(iter(cand))], 'prefixo'
    return None, None
casou = collections.Counter()
matc = collections.defaultdict(collections.Counter)   # peça -> Material (código do distribuidor) nas vendas
estcod = {}                                              # peça -> Produto (código do distribuidor) no estoque
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
    pi, como = resolver_peca(cod)
    if pi is None: continue
    casou[como] += 1
    if s(r[5]): matc[pi][s(r[5])] += 1
    vl[(pi, s(r[1]), d.year)][d.month - 1] += r[3] or 0
    k = (ci, pi, d.strftime('%Y-%m'))
    a = agg[k]; a[0] += r[3] or 0; a[1] += r[14] or 0; a[2] = max(a[2], (d - datetime.datetime(1899, 12, 30)).days); a[3] += max(r[3] or 0, 0)
V = [[k[0], k[1], k[2], round(a[0], 3), round(a[1], 2), a[2], round(a[3], 3)] for k, a in agg.items()]
print('vendas casadas com o catálogo:', dict(casou))
# distribuidores: cadastro (cód. da fábrica -> cód. do distribuidor). Só o Padre Cícero tem cadastro na planilha.
dpc = {}
for cod, (c, desc, sit) in pc.items():
    if cod in pidx: dpc[pidx[cod]] = [c, desc, sit]
if cadastro_xlsx:  # base de cadastro do distribuidor (Material = cód. dele, REFERENCIA = cód. Eurotécnica); casa por código exato ou 8 primeiros dígitos
    import unicodedata
    def _n(t): return unicodedata.normalize('NFD', str(t or '')).encode('ascii', 'ignore').decode().lower().strip()
    cw = openpyxl.load_workbook(cadastro_xlsx, read_only=True, data_only=True).active
    crow = list(cw.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(crow[:15]) if any(_n(x) == 'referencia' for x in r) and any(_n(x) == 'material' for x in r))
    H = [_n(x) for x in crow[hi]]
    ie, im, ids, ist = H.index('referencia'), H.index('material'), next((i for i, x in enumerate(H) if 'descri' in x), -1), next((i for i, x in enumerate(H) if 'situa' in x or 'stiua' in x), -1)
    novo = {}
    for r in crow[hi + 1:]:
        cod = s(r[ie])
        if not cod or (ist >= 0 and _n(r[ist]) not in ('', 'ativo')): continue
        pi, como = resolver_peca(cod)
        if pi is None or (pi in novo and como != 'exato'): continue
        novo[pi] = [s(r[im]).replace('.0', ''), s(r[ids]) if ids >= 0 else '', 'ATIVO']
    print('cadastro do distribuidor:', len(novo), 'códigos de caixa (antes:', len(dpc), ')')
    dpc = novo
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
        if pi is not None and s(r[0]): estcod.setdefault(pi, s(r[0]))
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
# Item que o distribuidor vendeu ou tem em estoque sempre tem código dele: se faltar no cadastro, vale o do estoque (Produto) ou o das vendas (Material)
extra = 0
for pi in sorted(set(matc) | set(estcod)):
    if pi in D[0]['c']: continue
    cod = estcod.get(pi) or matc[pi].most_common(1)[0][0]
    if cod: D[0]['c'][pi] = [cod, 'código obtido do estoque/vendas do distribuidor', 'ATIVO']; extra += 1
print('códigos do distribuidor completados pelo estoque/vendas:', extra)
T = [[k[0], k[1], round(v, 2)] for k, v in tot.items()]
data = {'P': parts, 'CX': caixas, 'C': cli, 'R': reps, 'V': V, 'D': D, 'T': T}
tpl = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
out = tpl.replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
open(os.path.join(here, 'index.html'), 'w', encoding='utf-8').write(out)
print(len(parts), 'peças |', len(caixas), 'caixas |', len(cli), 'clientes |', len(V), 'linhas de venda |', len(out) // 1024, 'KB')
