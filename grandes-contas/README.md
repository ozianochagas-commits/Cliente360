# Grandes Contas 360 — comparativo por caixa de motor

Painel estático (HTML + ES modules, sem build). Para abrir localmente, sirva a pasta por HTTP:

```bash
cd grandes-contas && python3 -m http.server 8000   # http://localhost:8000
```

No Vercel basta publicar a pasta (o `index.html` da raiz do repositório é outro app e não foi alterado).

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/config.js` | Referências (Padre Cícero / Bezerra Oliveira), cores por marca, mínimo de histórico, sinônimos de colunas |
| `js/engine.js` | Regras de negócio puras: índice de compras, status por código, oportunidades, filtros, indicadores |
| `js/importer.js` | Importação de `.xlsx` / `.csv` (cadastro de produtos e histórico de vendas) |
| `js/app.js` | Estado, filtros, tabela, painéis, detalhe do produto |
| `data/catalogo.json` | Catálogo de caixas e produtos (sem dados de clientes, versionado)
| `data/base.json` | Vendas reais (gerado, fora do Git; opcional) |
| `data/demo.json` | Compras **fictícias** (modo Demonstração, com banner amarelo) |
| `../scripts/build_data.py` | Regenera os dois JSON a partir das planilhas |

Atualizar a base: `python3 -I scripts/build_data.py --caixas <Caixas.xlsx> --vendas <Vendas.xlsx>`
ou usar **Importar planilha** no painel (fica só no navegador, até recarregar).

## Regras de negócio

- **Comparação por código** Eurotécnica. Nas vendas, o vínculo é feito pelo `Material` (código Padre Cícero, aba *Cadastro Padre Cícero*) e, na falta, por `Nº peça fabricante`.
- **Comprou** = existe venda (CFOP 5xxx/6xxx, exceto 59xx/69xx, quantidade > 0) no período. Devoluções e remessas não contam.
- **Nunca comprou (vermelho)** só é afirmado se o cliente tem histórico suficiente: no mínimo `minProdutosHistorico` (5) produtos distintos de caixas no período. Abaixo disso → **cinza** (sem histórico suficiente). Ausência de dado ≠ ausência de compra.
- **Oportunidade (laranja)** = cliente analisado confirmado como "nunca comprou" + pelo menos uma referência com histórico confirmado comprou. Produtos com *venda suspensa* ou *substituídos* não são sugeridos.
- Mesmo período (`de`/`até`) para os três clientes.
- Indicadores consideram os filtros de caixa, marca, família, curva, produto e pesquisa; a "visão" (abas de oportunidade) só filtra a tabela e mostra a contagem de cada uma.

## Limitação conhecida da base atual

Na planilha `Vendas_Eurotecnica_3.xlsx` **não há Padre Cícero nem Bezerra Oliveira como compradores** (só uma linha de "Auto Peças Padre cicero" e uma de "Antonio Bezerra de Oliveira", ambas insuficientes). Por isso, em *Dados reais* o painel avisa e pede que se escolha o cliente de referência nos campos *Referência 1/2*. Ao importar uma base que contenha os dois, eles são detectados automaticamente pelo nome (`CONFIG.referencias`).
