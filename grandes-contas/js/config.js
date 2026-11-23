// Configuração central — ajuste aqui sem mexer na lógica.
export const CONFIG = {
  // Clientes de referência. `padroes`: todos os termos devem aparecer no nome (sem acento/caixa).
  referencias: [
    { chave: 'r1', rotulo: 'Padre Cícero',    padroes: [['PADRE', 'CICERO']] },
    { chave: 'r2', rotulo: 'Bezerra Oliveira', padroes: [['BEZERRA', 'OLIVEIRA']] },
  ],
  // Mínimo de produtos distintos (do catálogo de caixas) comprados no período para que a
  // AUSÊNCIA de compra de um cliente seja confirmável. Abaixo disso => CINZA (sem histórico suficiente).
  minProdutosHistorico: 5,
  // CFOP considerados venda: iniciados em 5 ou 6, exceto 59xx/69xx (remessas/bonificações). Aplicado em scripts/build_data.py.
  // Cores por marca — NÃO misturar. Status (verde/vermelho/laranja/cinza) usa outro canal visual.
  marcas: {
    'EUROTÉCNICA':  { cor: '#1D4ED8', fundo: '#DBEAFE', nome: 'Eurotécnica' },
    'EURORICAMBI':  { cor: '#7C3AED', fundo: '#EDE9FE', nome: 'Euroricambi' },
    'ENGRETECNICA': { cor: '#0E7490', fundo: '#CFFAFE', nome: 'Engretécnica' },
  },
  marcaPadrao: { cor: '#525252', fundo: '#E5E5E5', nome: 'Outra' },
  // Sinônimos de cabeçalho para importação de planilhas/CSV (normalizados: minúsculo, sem acento).
  sinonimos: {
    cadastro: {
      codigo: ['codigo', 'cod', 'cod produto', 'codigo do produto', 'cod eurotecnica', 'no eurotecnica edi', 'material', 'sku'],
      descricao: ['descricao', 'descricao do produto', 'produto', 'texto breve material'],
      marca: ['marca', 'fabricante'],
      caixa: ['caixa', 'caixa de motor', 'caixa de cambio', 'aba'],
      familia: ['familia', 'grupo', 'linha', 'categoria'],
      curva: ['curva'], aplicacao: ['aplicacao'], montadora: ['montadora'],
    },
    vendas: {
      cliente: ['cliente', 'nome cliente', 'nome 1', 'razao social', 'nome'],
      codCliente: ['cod cliente', 'codigo cliente', 'id cliente'],
      codigo: ['codigo', 'cod produto', 'codigo do produto', 'no peca fabricante', 'cod eurotecnica', 'material'],
      data: ['data', 'data da compra', 'data documento', 'data de lancamento', 'emissao'],
      quantidade: ['quantidade', 'qtd', 'qtd comprada', 'quantidade comprada'],
      valor: ['valor', 'valor liquido', 'total'],
      nf: ['nf', 'nota fiscal', 'numero de nota fiscal eletronica'],
      vendedor: ['vendedor', 'representante'],
    },
  },
};
export const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
