// Importação de planilhas (.xlsx/.xls via SheetJS carregado sob demanda) e CSV.
import { CONFIG, norm } from './config.js';

const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let sheetPromise;
function carregarSheetJS() {
  if (window.XLSX) return Promise.resolve();
  return (sheetPromise ??= new Promise((ok, err) => {
    const s = document.createElement('script'); s.src = SHEETJS; s.onload = ok;
    s.onerror = () => err(new Error('Não foi possível carregar o leitor de Excel (SheetJS). Use CSV ou verifique a conexão.')); document.head.append(s);
  }));
}

function parseCSV(txt) {
  const first = txt.split(/\r?\n/, 1)[0];
  const d = [';', '\t', ','].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function lerArquivo(file) {
  if (/\.csv$/i.test(file.name)) return parseCSV(await file.text());
  await carregarSheetJS();
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const nomePref = wb.SheetNames.find((n) => /base|dados|vendas|lista/i.test(n)) || wb.SheetNames[0];
  return window.XLSX.utils.sheet_to_json(wb.Sheets[nomePref], { header: 1, raw: true, defval: '' });
}

/** Localiza a linha de cabeçalho e o mapa campo -> índice de coluna (primeira ocorrência). */
function mapear(rows, sin) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const hs = rows[r].map(norm); const mapa = {};
    for (const [campo, nomes] of Object.entries(sin)) {
      const i = hs.findIndex((h) => nomes.includes(h)); if (i >= 0) mapa[campo] = i;
    }
    if (Object.keys(mapa).length >= 3) return { linha: r, mapa };
  }
  return null;
}

const S = (x) => (x == null ? '' : String(x).trim());
const COD = (x) => { const t = S(x); return /^\d+\.0$/.test(t) ? t.slice(0, -2) : t; };
export function paraData(x) {
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (typeof x === 'number') return new Date(Date.UTC(1899, 11, 30) + x * 864e5).toISOString().slice(0, 10);
  const t = S(x); let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
const NUM = (x) => (typeof x === 'number' ? x : parseFloat(S(x).replace(/\./g, '').replace(',', '.')) || 0);

/** Cadastro -> { caixas, produtos } */
export async function importarCadastro(file) {
  const rows = await lerArquivo(file); const m = mapear(rows, CONFIG.sinonimos.cadastro);
  if (!m || m.mapa.codigo == null || m.mapa.caixa == null) throw new Error('Cadastro: não encontrei as colunas "código" e "caixa de motor".');
  const { mapa, linha } = m; const produtos = {}, cx = new Map();
  for (const r of rows.slice(linha + 1)) {
    const c = COD(r[mapa.codigo]); const caixa = S(r[mapa.caixa]); if (!c || !caixa) continue;
    produtos[c] ??= { d: S(r[mapa.descricao]), m: S(r[mapa.marca]).toUpperCase(), f: S(r[mapa.familia]) || 'Outros', l: '', st: 'ok', sub: null, c: S(r[mapa.curva]), pc: '', cx: [] };
    produtos[c].cx.push(caixa);
    if (!cx.has(caixa)) cx.set(caixa, { id: caixa, montadora: S(r[mapa.montadora]) || '—', itens: [] });
    cx.get(caixa).itens.push([c, S(r[mapa.curva]), S(r[mapa.aplicacao]), '']);
  }
  return { produtos, caixas: [...cx.values()], linhas: Object.keys(produtos).length };
}

/** Vendas -> { clientes, vendas, semVinculo[] } ligando por código ao catálogo informado. */
export async function importarVendas(file, produtos) {
  const rows = await lerArquivo(file); const m = mapear(rows, CONFIG.sinonimos.vendas);
  if (!m || m.mapa.cliente == null && m.mapa.codCliente == null || m.mapa.codigo == null || m.mapa.data == null)
    throw new Error('Vendas: não encontrei as colunas "cliente", "código do produto" e "data".');
  const { mapa, linha } = m; const cat = new Set(Object.keys(produtos));
  const bare = new Map(); for (const c of cat) { const b = c.split('-')[0].replace(/^0+/, ''); bare.set(b, [...(bare.get(b) || []), c]); }
  const clientes = [], cidx = new Map(), vendas = [], sem = new Map(); let lidas = 0;
  for (const r of rows.slice(linha + 1)) {
    const nome = S(r[mapa.cliente ?? mapa.codCliente]); const idc = S(r[mapa.codCliente ?? mapa.cliente]);
    if (!nome && !idc) continue; lidas++;
    const toks = S(r[mapa.codigo]).split('/').map((t) => t.trim()).filter(Boolean);
    let cod = toks.find((t) => cat.has(t));
    if (!cod) { const cand = new Set(toks.flatMap((t) => bare.get(t.split('-')[0].replace(/^0+/, '')) || [])); if (cand.size === 1) cod = [...cand][0]; }
    if (!cod) { const k = toks[0] || '(vazio)'; sem.set(k, (sem.get(k) || 0) + 1); continue; }
    const q = NUM(r[mapa.quantidade]); const data = paraData(r[mapa.data]); if (!data || q <= 0) continue;
    if (!cidx.has(idc)) { cidx.set(idc, clientes.length); clientes.push({ id: idc, nome: nome || idc, cidade: '', uf: '' }); }
    vendas.push([cidx.get(idc), cod, data, q, mapa.valor != null ? NUM(r[mapa.valor]) : 0, S(r[mapa.nf]), S(r[mapa.vendedor])]);
  }
  return { clientes, vendas, lidas, semVinculo: [...sem].sort((a, b) => b[1] - a[1]) };
}
