#!/usr/bin/env python3
"""Gera grandes-contas/data/base.json (e demo.json) a partir das planilhas comerciais.

Uso:
  python3 -I scripts/build_data.py --caixas Caixas.xlsx --vendas Vendas.xlsx [--out grandes-contas/data]

Nada é inventado: base.json contém apenas o que está nas planilhas.
demo.json contém compras FICTÍCIAS (identificadas como demo) sobre o catálogo real.
"""
import argparse, json, random, re, datetime as dt
from collections import defaultdict, Counter
import openpyxl

ap = argparse.ArgumentParser()
ap.add_argument('--caixas', required=True)
ap.add_argument('--vendas', required=True)
ap.add_argument('--out', default='grandes-contas/data')
a = ap.parse_args()

def s(x): return '' if x is None else str(x).strip()
def code(x):
    t = s(x)
    return t[:-2] if re.fullmatch(r'\d+\.0', t) else t
def to_date(x):
    if isinstance(x, dt.datetime): return x.date()
    if isinstance(x, (int, float)): return (dt.datetime(1899, 12, 30) + dt.timedelta(days=int(x))).date()
    t = s(x)
    if re.fullmatch(r'\d{5}', t): return (dt.datetime(1899, 12, 30) + dt.timedelta(days=int(t))).date()
    return dt.date.fromisoformat(t[:10]) if t else None

# ---------- Caixas / catálogo ----------
wb = openpyxl.load_workbook(a.caixas, data_only=True)
lista = {}
ws = wb['Lista']
hdr = [s(c) for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
ix = {h: i for i, h in enumerate(hdr)}
for r in ws.iter_rows(min_row=2, values_only=True):
    c = s(r[ix['Nº Eurotécnica EDI']])
    if not c: continue
    preco = r[ix['Preço Bruto']]
    status, subst = 'ok', None
    if isinstance(preco, str):
        if 'suspensa' in preco.lower(): status = 'suspensa'
        m = re.match(r'USE\s+(\S+)', preco.strip(), re.I)
        if m: status, subst = 'substituido', m.group(1)
    lista[c] = dict(d=s(r[ix['Descrição']]), m=s(r[ix['Marca']]).upper(), f=s(r[ix['Grupo']]) or 'Outros',
                    l=s(r[ix['Linha']]), st=status, sub=subst)

pc_map = {}   # Material (cód. Padre Cícero) -> cód. Eurotécnica
pc_of = {}
for r in wb['Cadastro Padre Cícero'].iter_rows(min_row=2, values_only=True):
    e, p = s(r[0]), code(r[1])
    if e and p:
        pc_map[p] = e; pc_of[e] = p

index_ws = wb['Análise Caixas']
mont_of = {}; cur = ''
for r in index_ws.iter_rows(min_row=13, max_row=46, values_only=True):
    if r[1]: cur = s(r[1])
    if r[2] and s(r[1]) != 'TOTAL': mont_of[s(r[2])] = cur

caixas, produtos = [], {}
for name in wb.sheetnames[1:]:
    if name in ('Lista', 'Cadastro Padre Cícero'): continue
    itens = []
    for r in wb[name].iter_rows(min_row=2, values_only=True):
        c = s(r[0])
        if not c: continue
        itens.append([c, s(r[3]), s(r[5]), s(r[6])])   # cód, curva, aplicação, qtd aplicada
        if c not in produtos:
            p = dict(lista.get(c, dict(d=s(r[4]), m='', f='Outros', l='', st='ok', sub=None)))
            p['c'] = s(r[3]); p['pc'] = pc_of.get(c, ''); p['cx'] = []
            produtos[c] = p
        produtos[c]['cx'].append(name)
    caixas.append(dict(id=name, montadora=mont_of.get(name, '—'), itens=itens))

# ---------- Vendas ----------
wv = openpyxl.load_workbook(a.vendas, read_only=True, data_only=True)['Base Dados']
rows = list(wv.iter_rows(values_only=True))
H = rows[0]; names_idx = [i for i, h in enumerate(H) if h == 'Nome 1']
I = {h: i for i, h in enumerate(H) if h != 'Nome 1'}
cat_codes = set(lista)
bare = defaultdict(list)
for c in cat_codes: bare[c.split('-')[0].lstrip('0')].append(c)

VENDA = lambda cf: cf[:1] in '56' and cf[:2] not in ('59',)
clientes, cidx, vendas = [], {}, []
stat = Counter(); via = Counter()
for r in rows[1:]:
    if not r[I['Material']]: continue
    stat['linhas'] += 1
    cf = s(r[I['CFOP']]).split('/')[0]
    q = float(r[I['Quantidade']] or 0)
    if not VENDA(cf) or q <= 0:
        stat['ignoradas_nao_venda'] += 1; continue
    d = to_date(r[I['Data documento']])
    mat = s(r[I['Material']]).lstrip('0')
    toks = [t.strip() for t in s(r[I['Nº peça fabricante']]).split('/') if t.strip()]
    cod = None
    if mat in pc_map: cod, v_ = pc_map[mat], 'material'
    else:
        hit = [t for t in toks if t in cat_codes]
        if len(hit) >= 1: cod, v_ = hit[0], 'fabricante'
        else:
            cand = {c for t in toks for c in bare.get(t.split('-')[0].lstrip('0'), [])}
            if len(cand) == 1: cod, v_ = cand.pop(), 'fabricante_prefixo'
    if not cod: stat['sem_vinculo'] += 1; continue
    via[v_] += 1
    cid = s(r[I['Cliente']])
    if cid not in cidx:
        cidx[cid] = len(clientes)
        clientes.append(dict(id=cid, nome=s(r[names_idx[0]]), cidade=s(r[I['Local']]), uf=s(r[I['Região']])))
    vendas.append([cidx[cid], cod, d.isoformat(), q, round(float(r[I['Valor líquido']] or 0), 2),
                   s(r[I['Número de nota fiscal eletrônica']]), s(r[names_idx[2]]) if len(names_idx) > 2 else ''])
    stat['vinculadas'] += 1
    if cod not in produtos:   # vendido mas fora das abas de caixa: mantém só no catálogo geral
        pass

datas = [v[2] for v in vendas]
meta = dict(fonte='Vendas_Eurotecnica_3.xlsx + Caixas_Eurotécnica_DEZ.26.xlsx', demo=False,
            periodo=dict(ini=min(datas), fim=max(datas)), stats=dict(stat), vinculo=dict(via),
            gerado=dt.date.today().isoformat())
import os; os.makedirs(a.out, exist_ok=True)
json.dump(dict(meta=meta, caixas=caixas, produtos=produtos, clientes=clientes,
               vendasCols=['cli', 'cod', 'data', 'qtd', 'valor', 'nf', 'vendedor'], vendas=vendas),
          open(f'{a.out}/base.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# ---------- Demo (FICTÍCIO) ----------
rnd = random.Random(2026)
allc = sorted(produtos)
def fake(nome, perc, cid):
    idx = len(dcli); dcli.append(dict(id=cid, nome=nome, cidade='DEMO', uf='--'))
    for c in allc:
        if rnd.random() < perc:
            for _ in range(rnd.choice([1, 1, 2, 3])):
                m = rnd.randint(1, 10); dia = rnd.randint(1, 28)
                dv.append([idx, c, f'2026-{m:02d}-{dia:02d}', rnd.choice([1, 1, 2, 4]), 0, 'DEMO', 'DEMO'])
dcli, dv = [], []
fake('[DEMO] PADRE CÍCERO', 0.55, 'DEMO-PC'); fake('[DEMO] BEZERRA OLIVEIRA', 0.45, 'DEMO-BO')
for i, p in enumerate([.12, .25, .08, .35, .18, .03]): fake(f'[DEMO] CLIENTE FICTÍCIO {chr(65+i)}', p, f'DEMO-{i}')
dm = dict(meta, demo=True, fonte='DADOS FICTÍCIOS de demonstração', periodo=dict(ini='2026-01-01', fim='2026-10-31'),
          stats=dict(linhas=len(dv), vinculadas=len(dv)))
json.dump(dict(meta=dm, clientes=dcli, vendasCols=['cli', 'cod', 'data', 'qtd', 'valor', 'nf', 'vendedor'], vendas=dv),
          open(f'{a.out}/demo.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps(meta, ensure_ascii=False, indent=1)); print('caixas', len(caixas), 'produtos', len(produtos), 'clientes', len(clientes))
