// Motor de análise — funções puras (sem DOM), comparação sempre por CÓDIGO de produto.
import { CONFIG, norm } from './config.js';

/** Constrói índices a partir do dataset { produtos, caixas, clientes, vendas, vendasCols }. */
export function indexar(ds) {
  const compras = new Map();          // clienteIdx -> Map(codigo -> {qtd, n, ult, prim, linhas[]})
  for (const v of ds.vendas) {
    const [cli, cod, data, qtd, valor, nf, vend] = v;
    let m = compras.get(cli); if (!m) compras.set(cli, (m = new Map()));
    let e = m.get(cod); if (!e) m.set(cod, (e = { qtd: 0, n: 0, ult: '', prim: '9999', linhas: [] }));
    e.qtd += qtd; e.n++; e.linhas.push({ data, qtd, valor, nf, vendedor: vend });
    if (data > e.ult) e.ult = data; if (data < e.prim) e.prim = data;
  }
  const nomes = ds.clientes.map((c) => norm(c.nome));
  return { compras, nomes };
}

/** Filtra vendas por período (mesmo período para os três clientes) — devolve novo mapa. */
export function comprasNoPeriodo(idx, ds, ini, fim) {
  if (!ini && !fim) return idx.compras;
  const out = new Map();
  for (const [cli, m] of idx.compras) {
    const mm = new Map();
    for (const [cod, e] of m) {
      const ls = e.linhas.filter((l) => (!ini || l.data >= ini) && (!fim || l.data <= fim));
      if (!ls.length) continue;
      mm.set(cod, { qtd: ls.reduce((a, l) => a + l.qtd, 0), n: ls.length, ult: ls.reduce((a, l) => (l.data > a ? l.data : a), ''), prim: ls.reduce((a, l) => (l.data < a ? l.data : a), '9999'), linhas: ls });
    }
    if (mm.size) out.set(cli, mm);
  }
  return out;
}

/** Procura clientes cujo nome contém todos os termos de algum padrão. */
export function localizarReferencia(idx, ds, ref) {
  const hits = [];
  idx.nomes.forEach((n, i) => {
    if (ref.padroes.some((p) => p.every((t) => n.includes(norm(t))))) hits.push(i);
  });
  return hits;
}

/**
 * Perfil de histórico de um cliente no período:
 *  suficiente = tem produtos distintos >= minProdutosHistorico (ausência confirmável).
 */
export function perfil(compras, cli) {
  const m = cli == null ? null : compras.get(cli);
  const n = m ? m.size : 0;
  return { n, existe: n > 0, suficiente: n >= CONFIG.minProdutosHistorico };
}

/** Status do cliente para um produto: 'comprou' | 'nao' | 'sem'. */
export function statusCliente(compras, perf, cli, cod) {
  if (cli == null) return 'sem';
  if (compras.get(cli)?.has(cod)) return 'comprou';
  return perf.suficiente ? 'nao' : 'sem';
}

/**
 * Classifica um produto. clientes: {a, r1, r2} (índices ou null).
 * Retorna { a, r1, r2, estado, oport } onde estado ∈ verde|vermelho|laranja|cinza e
 * oport ∈ ''|'ambos'|'r1'|'r2'.
 */
export function classificar(ctx, prod, cod) {
  const { compras, perfis, sel } = ctx;
  const a = statusCliente(compras, perfis.a, sel.a, cod);
  const r1 = statusCliente(compras, perfis.r1, sel.r1, cod);
  const r2 = statusCliente(compras, perfis.r2, sel.r2, cod);
  const bloqueado = prod.st && prod.st !== 'ok';           // venda suspensa / substituído: não é oportunidade
  let oport = '';
  if (a === 'nao' && !bloqueado) {
    if (r1 === 'comprou' && r2 === 'comprou') oport = 'ambos';
    else if (r1 === 'comprou') oport = 'r1';
    else if (r2 === 'comprou') oport = 'r2';
  }
  const estado = a === 'comprou' ? 'verde' : oport ? 'laranja' : a === 'nao' ? 'vermelho' : 'cinza';
  return { a, r1, r2, estado, oport, bloqueado };
}

export const VISOES = [
  ['todos', 'Todos os produtos da caixa'],
  ['comprados', 'Somente comprados pelo cliente'],
  ['nao', 'Somente não comprados'],
  ['r1', 'Padre Cícero compra · cliente não'],
  ['r2', 'Bezerra Oliveira compra · cliente não'],
  ['ambos', 'Os dois compram · cliente não'],
];
export function passaVisao(visao, c) {
  switch (visao) {
    case 'comprados': return c.a === 'comprou';
    case 'nao': return c.a === 'nao';
    case 'r1': return c.a === 'nao' && c.r1 === 'comprou' && !c.bloqueado;
    case 'r2': return c.a === 'nao' && c.r2 === 'comprou' && !c.bloqueado;
    case 'ambos': return c.oport === 'ambos';
    default: return true;
  }
}

/** Lista de produtos (únicos por código) da caixa selecionada ('' = todas). */
export function produtosDaCaixa(ds, caixaId) {
  const cxs = caixaId ? ds.caixas.filter((c) => c.id === caixaId) : ds.caixas;
  const seen = new Map();
  for (const cx of cxs) for (const [cod, curva, aplic, qtdApl] of cx.itens) {
    if (!seen.has(cod)) seen.set(cod, { cod, ...ds.produtos[cod], curvaCx: curva, aplic, qtdApl });
  }
  return [...seen.values()];
}

export function filtrarCatalogo(lista, f) {
  const q = norm(f.busca || '');
  return lista.filter((p) => {
    if (f.marca && p.m !== f.marca) return false;
    if (f.familia && p.f !== f.familia) return false;
    if (f.curva && (p.curvaCx || p.c) !== f.curva) return false;
    if (f.produto && p.cod !== f.produto) return false;
    if (q && !norm(`${p.cod} ${p.d} ${p.aplic || ''} ${p.pc || ''}`).includes(q)) return false;
    return true;
  });
}

/** Indicadores sobre o universo filtrado (antes da "visão"). */
export function indicadores(ctx, universo) {
  const cls = universo.map((p) => classificar(ctx, p, p.cod));
  const tot = universo.length;
  const cob = (k) => {
    const cli = ctx.sel[k];
    if (cli == null || !ctx.perfis[k].existe) return { n: 0, pct: null, ok: false, suf: false };
    const n = universo.filter((p) => ctx.compras.get(cli)?.has(p.cod)).length;
    return { n, pct: tot ? (n / tot) * 100 : 0, ok: true, suf: ctx.perfis[k].suficiente };
  };
  const comprados = cls.filter((c) => c.a === 'comprou').length;
  return {
    total: tot, comprados,
    naoComprados: cls.filter((c) => c.a === 'nao').length,
    semHistorico: cls.filter((c) => c.a === 'sem').length,
    cobertura: tot ? (comprados / tot) * 100 : 0,
    oportunidades: cls.filter((c) => c.oport).length,
    cobertos: { a: cob('a'), r1: cob('r1'), r2: cob('r2') },
    classes: cls,
  };
}
