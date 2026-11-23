-- Grandes Contas 360 — esquema (PostgreSQL/Supabase e SQLite compatível)
create table produtos (codigo text primary key, descricao text, marca text, familia text, curva text, cod_padre_cicero text, situacao text default 'ok', substituido_por text);
create table caixas (id text primary key, montadora text);
create table caixa_produtos (caixa_id text references caixas(id), codigo text references produtos(codigo), curva text, aplicacao text, qtd_aplicada text, primary key (caixa_id, codigo));
create table clientes (id text primary key, nome text not null, cidade text, uf text);
create table vendas (id integer primary key generated always as identity, cliente_id text references clientes(id), codigo text references produtos(codigo), data date not null, quantidade numeric not null, valor numeric, nf text, vendedor text);
create index vendas_cliente_idx on vendas(cliente_id, codigo);
-- Cliente x caixa: quantos produtos tem / não tem
create view cobertura_cliente_caixa as
select c.id cliente_id, c.nome, cp.caixa_id, count(distinct cp.codigo) total, count(distinct v.codigo) tem, count(distinct cp.codigo) - count(distinct v.codigo) nao_tem
from clientes c cross join caixa_produtos cp left join vendas v on v.cliente_id = c.id and v.codigo = cp.codigo group by c.id, c.nome, cp.caixa_id;
