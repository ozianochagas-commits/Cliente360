import { CONFIG, norm } from './config.js';
import * as E from './engine.js';
import { importarCadastro, importarVendas } from './importer.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const fmtNum = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const pct = (v) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%');
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('gc360.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('gc360.' + k, JSON.stringify(v)); } catch { /* sem storage */ } },
};

const S = {
  base: null, demo: null, real: null, ds: null, idx: null, compras: null,
  modo: 'real',
  sel: { a: null, r1: null, r2: null },
  caixa: '', f: { marca: '', familia: '', curva: '', produto: '', busca: '' },
  visao: 'todos', per: { ini: '', fim: '' }, sort: { col: 'oport', dir: 1 },
};
const refRotulo = (k) => CONFIG.referencias.find((r) => r.chave === k).rotulo;
const nomeCli = (i) => (i == null ? '' : S.ds.clientes[i].nome);

/* ---------- Combobox pesquisável ---------- */
function combo(host, { itens, onPick, placeholder }) {
  host.innerHTML = `<input type="text" placeholder="${esc(placeholder)}" autocomplete="off"><ul hidden></ul>`;
  const inp = host.querySelector('input'), ul = host.querySelector('ul');
  const render = () => {
    const q = norm(inp.value);
    const lista = itens().filter((i) => !q || norm(i.busca ?? i.label).includes(q)).slice(0, 60);
    ul.innerHTML = `<li data-v="" data-limpar="1">— nenhum —</li>` +
      (lista.map((i) => `<li data-v="${esc(i.value)}">${esc(i.label)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</li>`).join('') || '<li class="vazio">nada encontrado</li>');
    ul.hidden = false;
  };
  inp.addEventListener('focus', () => { inp.select(); render(); });
  inp.addEventListener('input', render);
  ul.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li'); if (!li || li.classList.contains('vazio')) return;
    e.preventDefault(); ul.hidden = true; inp.blur(); onPick(li.dataset.v === '' ? null : li.dataset.v);
  });
  inp.addEventListener('blur', () => { ul.hidden = true; host.dispatchEvent(new Event('restore')); });
  return { set(texto) { inp.value = texto || ''; } };
}
let cbA, cbR1, cbR2, cbProd;

/* ---------- Dados ---------- */
async function carregar(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

function montarDataset(vendasDs) {
  // catálogo (produtos/caixas) vem da base; vendas/clientes da fonte ativa (real, demo ou importada)
  S.ds = { ...S.base, meta: vendasDs.meta, clientes: vendasDs.clientes, vendas: vendasDs.vendas };
  S.idx = E.indexar(S.ds);
  const { ini, fim } = S.ds.meta.periodo; S.per = { ini, fim };
  $('#per-ini').value = ini; $('#per-fim').value = fim;
  $('#banner-demo').hidden = !S.ds.meta.demo;
  $('#fonte').textContent = S.ds.meta.demo ? 'DADOS FICTÍCIOS (demonstração)' : `Fonte: ${S.ds.meta.fonte}`;
  autoReferencias(); sugerirCliente(); recalcCompras();
}

function autoReferencias() {
  const comp = S.idx.compras;
  for (const [k, r] of [['r1', CONFIG.referencias[0]], ['r2', CONFIG.referencias[1]]]) {
    const hits = E.localizarReferencia(S.idx, S.ds, r).sort((x, y) => (comp.get(y)?.size || 0) - (comp.get(x)?.size || 0));
    S.sel[k] = hits[0] ?? null;
  }
}
function sugerirCliente() {
  if (S.ds.meta.demo) { S.sel.a = S.ds.clientes.findIndex((c) => c.nome.includes('CLIENTE FICTÍCIO D')); return; }
  const salvo = store.get('cliente'); const i = salvo ? S.ds.clientes.findIndex((c) => c.id === salvo) : -1;
  if (i >= 0) { S.sel.a = i; return; }
  let best = null, n = -1;
  for (const [c, m] of S.idx.compras) if (m.size > n && c !== S.sel.r1 && c !== S.sel.r2) { best = c; n = m.size; }
  S.sel.a = best;
}
function recalcCompras() {
  S.compras = E.comprasNoPeriodo(S.idx, S.ds, S.per.ini, S.per.fim);
  renderTudo();
}

/* ---------- Contexto / cálculo ---------- */
function contexto() {
  const perfis = { a: E.perfil(S.compras, S.sel.a), r1: E.perfil(S.compras, S.sel.r1), r2: E.perfil(S.compras, S.sel.r2) };
  return { compras: S.compras, perfis, sel: S.sel };
}
function universo() { return E.filtrarCatalogo(E.produtosDaCaixa(S.ds, S.caixa), S.f); }

/* ---------- Render ---------- */
function renderTudo() { renderSelects(); renderChips(); renderAvisos(); renderPainel(); }

function opt(sel, valor, lista, rotuloTodos) {
  sel.innerHTML = `<option value="">${rotuloTodos}</option>` + lista.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  sel.value = lista.some(([v]) => v === valor) ? valor : '';
}
function renderSelects() {
  const prods = Object.values(S.ds.produtos);
  opt($('#f-caixa'), S.caixa, S.ds.caixas.map((c) => [c.id, `${c.montadora} · ${c.id} (${c.itens.length})`]), 'Todas as caixas');
  opt($('#f-marca'), S.f.marca, [...new Set(prods.map((p) => p.m).filter(Boolean))].sort().map((m) => [m, (CONFIG.marcas[m] || {}).nome || m]), 'Todas as marcas');
  opt($('#f-familia'), S.f.familia, [...new Set(prods.map((p) => p.f))].sort().map((f) => [f, f]), 'Todas as famílias');
  opt($('#f-curva'), S.f.curva, ['AA', 'A', 'B', 'C', 'Lançamento'].map((c) => [c, c]), 'Todas');
  if (document.activeElement !== $('#f-busca')) $('#f-busca').value = S.f.busca;
  cbA.set(nomeCli(S.sel.a)); cbR1.set(nomeCli(S.sel.r1)); cbR2.set(nomeCli(S.sel.r2)); cbProd.set(S.f.produto);
  $('#btn-real').classList.toggle('on', !S.ds.meta.demo); $('#btn-demo').classList.toggle('on', !!S.ds.meta.demo);
}
function renderChips() {
  const g = {}; S.ds.caixas.forEach((c) => (g[c.montadora] ??= []).push(c));
  $('#chips-caixas').innerHTML = `<button class="chip ${S.caixa === '' ? 'on' : ''}" data-cx="">TODAS</button>` + Object.entries(g).map(([m, cs]) =>
    `<div class="grupo"><b>${esc(m)}</b>${cs.map((c) => `<button class="chip ${S.caixa === c.id ? 'on' : ''}" data-cx="${esc(c.id)}">${esc(c.id)}<small>${c.itens.length}</small></button>`).join('')}</div>`).join('');
}
function renderAvisos() {
  const ctx = contexto(); const av = [];
  for (const k of ['r1', 'r2']) {
    const p = ctx.perfis[k], r = refRotulo(k), campo = k === 'r1' ? 'Referência 1' : 'Referência 2';
    if (S.sel[k] == null) av.push(['erro', `<b>${esc(r)}</b>: nenhum cliente com esse nome foi encontrado na base. Escolha o cliente de referência no campo “${campo}” — sem isso não há como apontar oportunidades a partir dele.`]);
    else if (!p.existe) av.push(['erro', `<b>${esc(r)}</b> (${esc(nomeCli(S.sel[k]))}) não tem nenhuma compra no período.`]);
    else if (!p.suficiente) av.push(['', `<b>${esc(r)}</b> (${esc(nomeCli(S.sel[k]))}) tem só ${p.n} produto(s) no histórico (mínimo ${CONFIG.minProdutosHistorico}). Histórico insuficiente: não gera oportunidades. Se esse não for o cliente certo, escolha outro em “${campo}”.`]);
  }
  const pa = ctx.perfis.a;
  if (S.sel.a == null) av.push(['erro', 'Selecione o cliente analisado.']);
  else if (!pa.suficiente) av.push(['', `Cliente analisado com histórico insuficiente (${pa.n} produto(s) no período): a ausência de compra não pode ser confirmada — os produtos aparecem em cinza.`]);
  const st = S.ds.meta.stats;
  if (st && st.sem_vinculo) av.push(['', `Qualidade da base: ${st.sem_vinculo} linha(s) de venda não puderam ser ligadas ao cadastro por código e ficaram fora da análise.`]);
  $('#avisos').innerHTML = av.map(([c, t]) => `<div class="aviso ${c}">${t}</div>`).join('');
}

function renderPainel() {
  const ctx = contexto(); const uni = universo(); const ind = E.indicadores(ctx, uni);
  const k = (rot, v, rod, cls = '') => `<div class="kpi ${cls}"><div class="r">${rot}</div><div class="v">${v}</div><div class="r">${rod}</div></div>`;
  $('#kpis').innerHTML =
    k('Produtos da caixa', fmtNum(ind.total), S.caixa ? `Caixa ${esc(S.caixa)}` : 'Todas as caixas') +
    k('Comprados pelo cliente', fmtNum(ind.comprados), 'no período', 'verde') +
    k('Não comprados', fmtNum(ind.naoComprados), ind.semHistorico ? `+ ${ind.semHistorico} sem histórico suficiente` : 'ausência confirmada', 'verm') +
    k('Cobertura do mix', pct(ind.cobertura), `${ind.comprados} de ${ind.total} produtos`) +
    k('Oportunidades comerciais', fmtNum(ind.oportunidades), 'referência compra · cliente não', 'destaque');
  const nomes = { a: nomeCli(S.sel.a) || 'Cliente analisado', r1: refRotulo('r1'), r2: refRotulo('r2') };
  $('#comp-barras').innerHTML = ['a', 'r1', 'r2'].map((c) => {
    const o = ind.cobertos[c]; const real = S.sel[c] != null ? nomeCli(S.sel[c]) : '';
    const tip = c !== 'a' && real ? ` title="${esc(real)}"` : '';
    return `<div class="barra ${c === 'a' ? '' : 'ref'}"><span class="nome"${tip}>${esc(nomes[c])}${c !== 'a' && real ? `<small class="tag">${esc(real)}</small>` : ''}</span><div class="trilho"><div class="fill" style="width:${o.ok ? o.pct : 0}%"></div></div>
      <span class="num">${o.ok ? `<b>${pct(o.pct)}</b> · ${o.n}${o.suf ? '' : ' ⚠'}` : 'sem histórico'}</span></div>`;
  }).join('');
  $('#comp-nota').textContent = `Mesmo período para os três: ${fmtData(S.per.ini)} a ${fmtData(S.per.fim)}. ⚠ = histórico abaixo do mínimo confiável.`;
  const cv = [['AA', 'AA'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['Lançamento', 'Lançam.']];
  $('#curvas').innerHTML = cv.map(([c, t]) => {
    const ps = uni.map((p, i) => [p, ind.classes[i]]).filter(([p]) => (p.curvaCx || p.c) === c);
    const n = ps.filter(([, x]) => x.a === 'comprou').length; const v = ps.length ? (n / ps.length) * 100 : 0;
    return `<div class="curva"><small>Curva ${t}</small><b>${ps.length ? pct(v) : '—'}</b><small>${n} de ${ps.length}</small><div class="mini"><i style="width:${v}%"></i></div></div>`;
  }).join('');
  const conta = (v) => ind.classes.filter((c) => E.passaVisao(v, c)).length;
  $('#visoes').innerHTML = E.VISOES.map(([v, t]) => {
    const rot = v === 'r1' ? `${refRotulo('r1')} compra · cliente não` : v === 'r2' ? `${refRotulo('r2')} compra · cliente não` : t;
    return `<button class="visao ${S.visao === v ? 'on' : ''} ${v === 'r1' || v === 'r2' || v === 'ambos' ? 'opp' : ''}" data-v="${v}">${esc(rot)}<b>${conta(v)}</b></button>`;
  }).join('');
  renderTabela(uni, ind);
}

function marcaHtml(m) { const b = CONFIG.marcas[m] || CONFIG.marcaPadrao; return `<span class="marca" style="background:${b.fundo};color:${b.cor}">${esc(b.nome === 'Outra' && m ? m : b.nome)}</span>`; }
function celula(st, cli, cod) {
  if (st === 'comprou') { const e = S.compras.get(cli).get(cod); return `<span class="pill verde">✔ Comprou<small>${fmtNum(e.qtd)} un · últ. ${fmtData(e.ult)}</small></span>`; }
  if (st === 'nao') return `<span class="pill vermelho">✖ Nunca comprou</span>`;
  return `<span class="pill cinza">— Sem histórico</span>`;
}
function oportHtml(c, p) {
  if (p.st === 'suspensa' && c.a !== 'comprou') return `<span class="pill susp">Venda suspensa<small>não ofertar</small></span>`;
  if (p.st === 'substituido' && c.a !== 'comprou') return `<span class="pill susp">Substituído<small>use ${esc(p.sub)}</small></span>`;
  if (c.oport) { const q = c.oport === 'ambos' ? `${refRotulo('r1')} + ${refRotulo('r2')}` : refRotulo(c.oport); return `<span class="pill laranja">★ OPORTUNIDADE<small>${esc(q)} compra</small></span>`; }
  if (c.a === 'comprou') return `<span class="pill verde">Já compra</span>`;
  if (c.a === 'nao' && c.r1 === 'sem' && c.r2 === 'sem') return `<span class="pill cinza">Sem referência válida<small>escolha clientes de referência</small></span>`;
  if (c.a === 'nao') return `<span class="pill vermelho">Não compra<small>referências também não</small></span>`;
  return `<span class="pill cinza">Sem base p/ classificar</span>`;
}
const ORDEM = { laranja: 0, vermelho: 1, verde: 2, cinza: 3 };
function renderTabela(uni, ind) {
  const linhas = uni.map((p, i) => ({ p, c: ind.classes[i] })).filter(({ c }) => E.passaVisao(S.visao, c));
  const { col, dir } = S.sort;
  const chave = { cod: ({ p }) => p.cod, desc: ({ p }) => p.d, marca: ({ p }) => p.m, oport: ({ c }) => ORDEM[c.estado] * 10 + (c.oport === 'ambos' ? 0 : 1),
    a: ({ c }) => c.a, r1: ({ c }) => c.r1, r2: ({ c }) => c.r2 };
  const f = chave[col] || chave.oport;
  linhas.sort((x, y) => { const a = f(x), b = f(y); return (a > b ? 1 : a < b ? -1 : x.p.cod.localeCompare(y.p.cod)) * dir; });
  $('#tab-contagem').textContent = `${linhas.length} de ${uni.length} produtos · clique na linha para ver o histórico`;
  const sub = (k) => `<small>${esc(nomeCli(S.sel[k]) || 'não definido')}</small>`;
  $('#tabela thead').innerHTML = `<tr><th data-c="cod">Código</th><th data-c="desc">Descrição</th><th data-c="marca">Marca</th>
    <th data-c="a">Cliente analisado<small>${esc(nomeCli(S.sel.a) || '—')}</small></th>
    <th data-c="r1">${esc(refRotulo('r1'))}${sub('r1')}</th><th data-c="r2">${esc(refRotulo('r2'))}${sub('r2')}</th>
    <th data-c="oport">Oportunidade comercial</th></tr>`;
  const tb = $('#tabela tbody');
  if (!linhas.length) { tb.innerHTML = `<tr><td colspan="7" class="vazio-tab">Nenhum produto para os filtros atuais.</td></tr>`; return; }
  tb.innerHTML = linhas.slice(0, 1500).map(({ p, c }) => {
    const b = CONFIG.marcas[p.m] || CONFIG.marcaPadrao;
    return `<tr class="${c.estado}" data-cod="${esc(p.cod)}"><td class="cod" style="--marca:${b.cor}">${esc(p.cod)}</td>
      <td>${esc(p.d)}<span class="tag">${esc(p.curvaCx || p.c || '')}</span>${S.caixa ? '' : `<span class="tag">${esc(p.cx.length > 1 ? p.cx.length + ' caixas' : p.cx[0])}</span>`}</td>
      <td>${marcaHtml(p.m)}</td><td>${celula(c.a, S.sel.a, p.cod)}</td><td>${celula(c.r1, S.sel.r1, p.cod)}</td><td>${celula(c.r2, S.sel.r2, p.cod)}</td><td>${oportHtml(c, p)}</td></tr>`;
  }).join('');
}

/* ---------- Detalhe do produto ---------- */
function abrirDetalhe(cod) {
  const p = { cod, ...S.ds.produtos[cod] }; const ctx = contexto(); const c = E.classificar(ctx, p, cod);
  const hist = (k, rot) => {
    const cli = S.sel[k]; const e = cli != null ? S.compras.get(cli)?.get(cod) : null;
    const cab = `<h4>${esc(rot)} — ${esc(nomeCli(cli) || 'não definido')}</h4>`;
    if (!e) return `<div class="hist">${cab}<p class="nota">${ctx.perfis[k].suficiente ? 'Sem compras deste produto no período.' : 'Histórico insuficiente para confirmar ausência de compra.'}</p></div>`;
    const ls = [...e.linhas].sort((x, y) => (x.data < y.data ? 1 : -1));
    return `<div class="hist">${cab}<table><thead><tr><th>Data</th><th>NF</th><th>Qtd</th><th>Valor</th><th>Vendedor</th></tr></thead><tbody>${ls.map((l) =>
      `<tr><td>${fmtData(l.data)}</td><td>${esc(l.nf)}</td><td>${fmtNum(l.qtd)}</td><td>${l.valor ? 'R$ ' + fmtNum(l.valor) : '—'}</td><td>${esc(l.vendedor)}</td></tr>`).join('')}</tbody></table>
      <p class="nota">${e.n} compra(s) · total ${fmtNum(e.qtd)} un · 1ª ${fmtData(e.prim)} · última ${fmtData(e.ult)}</p></div>`;
  };
  const ap = S.ds.caixas.filter((x) => p.cx.includes(x.id)).map((x) => x.itens.find((i) => i[0] === cod)?.[2]).find(Boolean);
  $('#drawer-corpo').innerHTML = `<h2>${esc(cod)} — ${esc(p.d)}</h2><div class="sub">${marcaHtml(p.m)} ${oportHtml(c, p)}</div>
    <dl class="dl"><dt>Família</dt><dd>${esc(p.f)}</dd><dt>Curva</dt><dd>${esc(p.c || '—')}</dd><dt>Caixas</dt><dd>${esc(p.cx.join(', '))}</dd>
    <dt>Aplicação</dt><dd>${esc(ap || '—')}</dd><dt>Cód. Padre Cícero</dt><dd>${esc(p.pc || '— (sem cadastro)')}</dd>
    <dt>Situação</dt><dd>${p.st === 'suspensa' ? 'Venda suspensa' : p.st === 'substituido' ? 'Substituído por ' + esc(p.sub) : 'Ativo'}</dd></dl>
    ${hist('a', 'Cliente analisado')}${hist('r1', refRotulo('r1'))}${hist('r2', refRotulo('r2'))}
    <p class="nota">Período analisado: ${fmtData(S.per.ini)} a ${fmtData(S.per.fim)}.</p>`;
  $('#drawer').hidden = false;
}

/* ---------- Eventos ---------- */
function persistir() { if (S.sel.a != null && !S.ds.meta.demo) store.set('cliente', S.ds.clientes[S.sel.a].id); }
function ligar() {
  const rotCli = (i) => ({ value: String(i), label: S.ds.clientes[i].nome, sub: `${[S.ds.clientes[i].cidade, S.ds.clientes[i].uf].filter(Boolean).join('/')} · ${S.compras.get(i)?.size || 0} produtos no período`, busca: `${S.ds.clientes[i].nome} ${S.ds.clientes[i].cidade}` });
  const todos = () => [...S.ds.clientes.keys()].sort((x, y) => (S.compras.get(y)?.size || 0) - (S.compras.get(x)?.size || 0)).map(rotCli);
  const pick = (k) => (v) => { S.sel[k] = v == null ? null : Number(v); persistir(); renderTudo(); };
  cbA = combo($('#cb-cliente'), { itens: todos, onPick: pick('a'), placeholder: 'digite o nome do cliente…' });
  cbR1 = combo($('#cb-r1'), { itens: todos, onPick: pick('r1'), placeholder: 'cliente de referência…' });
  cbR2 = combo($('#cb-r2'), { itens: todos, onPick: pick('r2'), placeholder: 'cliente de referência…' });
  cbProd = combo($('#cb-produto'), { itens: () => E.produtosDaCaixa(S.ds, S.caixa).map((p) => ({ value: p.cod, label: p.cod, sub: p.d })),
    onPick: (v) => { S.f.produto = v || ''; renderTudo(); }, placeholder: 'todos' });
  for (const h of ['#cb-cliente', '#cb-r1', '#cb-r2', '#cb-produto']) $(h).addEventListener('restore', () => { cbA.set(nomeCli(S.sel.a)); cbR1.set(nomeCli(S.sel.r1)); cbR2.set(nomeCli(S.sel.r2)); cbProd.set(S.f.produto); });
  const sel = (id, fn) => $(id).addEventListener('change', (e) => { fn(e.target.value); renderTudo(); });
  sel('#f-caixa', (v) => { S.caixa = v; S.f.produto = ''; store.set('caixa', v); });
  sel('#f-marca', (v) => (S.f.marca = v)); sel('#f-familia', (v) => (S.f.familia = v)); sel('#f-curva', (v) => (S.f.curva = v));
  $('#f-busca').addEventListener('input', (e) => { S.f.busca = e.target.value; renderPainel(); });
  $('#btn-limpar').addEventListener('click', () => { S.f = { marca: '', familia: '', curva: '', produto: '', busca: '' }; S.visao = 'todos'; renderTudo(); });
  $('#chips-caixas').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; S.caixa = b.dataset.cx; S.f.produto = ''; store.set('caixa', S.caixa); renderTudo(); });
  $('#visoes').addEventListener('click', (e) => { const b = e.target.closest('.visao'); if (!b) return; S.visao = b.dataset.v; renderPainel(); });
  $('#tabela thead').addEventListener('click', (e) => { const th = e.target.closest('th'); if (!th) return; const c = th.dataset.c; S.sort = { col: c, dir: S.sort.col === c ? -S.sort.dir : 1 }; renderPainel(); });
  $('#tabela tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-cod]'); if (tr) abrirDetalhe(tr.dataset.cod); });
  $('#drawer-fechar').addEventListener('click', () => ($('#drawer').hidden = true));
  $('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer') $('#drawer').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#drawer').hidden = true; });
  const per = () => { S.per = { ini: $('#per-ini').value, fim: $('#per-fim').value }; recalcCompras(); };
  $('#per-ini').addEventListener('change', per); $('#per-fim').addEventListener('change', per);
  $('#btn-real').addEventListener('click', () => { S.f.produto = ''; montarDataset(S.real); });
  $('#btn-demo').addEventListener('click', () => { S.f.produto = ''; montarDataset(S.demo); });
  $('#btn-importar').addEventListener('click', () => { $('#imp-resultado').textContent = ''; $('#dlg-importar').showModal(); });
  $('#imp-aplicar').addEventListener('click', aplicarImportacao);
}

async function aplicarImportacao() {
  const out = $('#imp-resultado'); const fc = $('#imp-cadastro').files[0], fv = $('#imp-vendas').files[0];
  if (!fv) { out.textContent = 'Selecione ao menos o arquivo de histórico de vendas.'; return; }
  const linhas = (m) => esc(m.join('\n')).replace(/\n/g, '<br>');
  try {
    out.textContent = 'Lendo…'; let base = S.base; const msgs = [];
    if (fc) { const c = await importarCadastro(fc); base = { ...S.base, produtos: c.produtos, caixas: c.caixas }; msgs.push(`Cadastro: ${c.linhas} produtos em ${c.caixas.length} caixas.`); }
    const v = await importarVendas(fv, base.produtos);
    msgs.push(`Vendas: ${v.vendas.length} de ${v.lidas} linhas ligadas por código a ${v.clientes.length} clientes.`);
    if (v.semVinculo.length) msgs.push(`Sem vínculo (${v.semVinculo.length} códigos, ficam fora): ${v.semVinculo.slice(0, 12).map(([c, n]) => `${c} (${n})`).join(', ')}${v.semVinculo.length > 12 ? '…' : ''}`);
    if (!v.vendas.length) { out.innerHTML = linhas(msgs) + '<br><b>Nada importado.</b>'; return; }
    const datas = v.vendas.map((x) => x[2]).sort();
    S.base = base;
    S.real = { meta: { fonte: `Importado: ${fv.name}`, demo: false, periodo: { ini: datas[0], fim: datas[datas.length - 1] }, stats: { linhas: v.lidas, vinculadas: v.vendas.length, sem_vinculo: v.lidas - v.vendas.length } }, clientes: v.clientes, vendas: v.vendas };
    S.demo = { ...S.demo, vendas: S.demo.vendas.filter((x) => base.produtos[x[1]]) };
    S.caixa = ''; montarDataset(S.real);
    out.innerHTML = linhas(msgs) + '<br><b>Aplicado.</b>';
  } catch (e) { out.textContent = 'Erro: ' + e.message; }
}

/* ---------- Início ---------- */
(async function init() {
  try {
    const [base, demo] = await Promise.all([carregar('data/base.json'), carregar('data/demo.json')]);
    S.base = base; S.demo = demo; S.real = { meta: base.meta, clientes: base.clientes, vendas: base.vendas };
    S.caixa = store.get('caixa') || ''; if (S.caixa && !base.caixas.some((c) => c.id === S.caixa)) S.caixa = '';
    ligar(); montarDataset(S.real);
  } catch (e) {
    document.querySelector('main').innerHTML = `<div class="aviso erro">Não foi possível carregar os dados (${esc(e.message)}). Abra o painel por um servidor web (ex.: <code>python3 -m http.server</code> dentro da pasta <code>grandes-contas</code>), não direto pelo arquivo.</div>`;
  }
})();
