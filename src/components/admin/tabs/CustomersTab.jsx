import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../../../services/api.js';
import { formatBRL } from '../../../services/currency.js';

function formatDateTimeBR(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

export default function CustomersTab({ onNotify, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('all'); // all | verified | pending
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  async function loadCustomers() {
    setLoading(true);
    try {
      const res = await apiService.getCustomers({ limit: 200 });
      if (res.success && Array.isArray(res.customers)) {
        setCustomers(res.customers);
      } else {
        onNotify?.(res.error || 'Erro ao carregar lista de clientes.', 'error');
      }
    } catch (err) {
      onNotify?.(err.message || 'Erro de conexão.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const matchVerified =
        verifiedFilter === 'all' ||
        (verifiedFilter === 'verified' && c.emailVerified) ||
        (verifiedFilter === 'pending' && !c.emailVerified);

      const matchSearch =
        !q ||
        (c.razaoSocial && c.razaoSocial.toLowerCase().includes(q)) ||
        (c.nomeFantasia && c.nomeFantasia.toLowerCase().includes(q)) ||
        (c.cnpj && c.cnpj.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.responsavelNome && c.responsavelNome.toLowerCase().includes(q)) ||
        (c.telefone && c.telefone.toLowerCase().includes(q)) ||
        (c.address?.cidade && c.address.cidade.toLowerCase().includes(q)) ||
        (c.address?.uf && c.address.uf.toLowerCase().includes(q));

      return matchVerified && matchSearch;
    });
  }, [customers, search, verifiedFilter]);

  const stats = useMemo(() => {
    const total = customers.length;
    const verified = customers.filter((c) => c.emailVerified).length;
    const pending = total - verified;
    const totalOrders = customers.reduce((sum, c) => sum + (c.ordersCount || 0), 0);
    const totalRevenueCents = customers.reduce((sum, c) => sum + (c.totalSpentCents || 0), 0);

    return { total, verified, pending, totalOrders, totalRevenueCents };
  }, [customers]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-bold uppercase tracking-wider text-[#64748B] block mb-1">
            Lojas Cadastradas
          </span>
          <strong className="text-2xl font-extrabold text-[#0F172A]">{stats.total}</strong>
          <span className="text-[11px] text-[#64748B] block mt-1">Contas B2B ativas</span>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-bold uppercase tracking-wider text-[#64748B] block mb-1">
            E-mails Verificados
          </span>
          <div className="flex items-center gap-1.5">
            <strong className="text-2xl font-extrabold text-emerald-600">{stats.verified}</strong>
            <span className="text-xs text-[#64748B]">/ {stats.total}</span>
          </div>
          <span className="text-[11px] text-emerald-700 block mt-1">
            {stats.pending > 0 ? `${stats.pending} pendente(s)` : 'Todas confirmadas'}
          </span>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-bold uppercase tracking-wider text-[#64748B] block mb-1">
            Pedidos B2B
          </span>
          <strong className="text-2xl font-extrabold text-[#006782]">{stats.totalOrders}</strong>
          <span className="text-[11px] text-[#64748B] block mt-1">Vinculados a clientes</span>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-bold uppercase tracking-wider text-[#64748B] block mb-1">
            Volume Total B2B
          </span>
          <strong className="text-2xl font-extrabold text-[#006782]">
            {formatBRL(stats.totalRevenueCents)}
          </strong>
          <span className="text-[11px] text-[#64748B] block mt-1">Faturamento acumulado</span>
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-4 border-b border-[#E2E8F0] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#F7F9FB]/50">
          <div className="flex-1 relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#64748B] text-[20px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por loja, razão social, CNPJ, responsável, e-mail, telefone ou cidade..."
              className="w-full pl-10 pr-4 py-2 border border-[#E2E8F0] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#00C6F7] bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={verifiedFilter}
              onChange={(e) => setVerifiedFilter(e.target.value)}
              className="py-2 px-3 border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#0F172A] bg-white focus:outline-none focus:border-[#00C6F7]"
            >
              <option value="all">Todos os Status de E-mail</option>
              <option value="verified">E-mail Verificado</option>
              <option value="pending">E-mail Pendente</option>
            </select>

            <button
              type="button"
              onClick={loadCustomers}
              disabled={loading}
              className="p-2 border border-[#E2E8F0] rounded-lg text-[#64748B] hover:text-[#0F172A] bg-white hover:bg-slate-50 transition-colors"
              title="Atualizar lista de clientes"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F7F9FB] border-b border-[#E2E8F0]">
                <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
                  Loja / Empresa
                </th>
                <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
                  Responsável & Contato
                </th>
                <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
                  Cidade / UF
                </th>
                <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
                  E-mail
                </th>
                <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
                  Pedidos & Total
                </th>
                <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
                  Cadastro
                </th>
                <th className="py-3 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B] text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-[#64748B] text-xs">
                    <span className="material-symbols-outlined animate-spin text-[28px] text-[#006782] block mb-2">
                      sync
                    </span>
                    Carregando clientes B2B...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-[#64748B] text-xs">
                    <span className="material-symbols-outlined text-[36px] text-slate-300 block mb-2">
                      storefront
                    </span>
                    Nenhum cliente encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    className="hover:bg-[#F7F9FB] transition-colors cursor-pointer group"
                    title="Clique em qualquer lugar da linha para abrir a ficha cadastral do cliente"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-600 text-[20px] flex-shrink-0">
                          store
                        </span>
                        <div className="min-w-0">
                          <strong className="text-xs text-[#0F172A] block font-semibold group-hover:underline truncate max-w-[200px]">
                            {customer.nomeFantasia || customer.razaoSocial}
                          </strong>
                          {customer.nomeFantasia && customer.razaoSocial !== customer.nomeFantasia && (
                            <span className="text-[11px] text-[#64748B] block truncate max-w-[200px]">
                              {customer.razaoSocial}
                            </span>
                          )}
                          <span className="text-[10.5px] text-[#64748B] font-mono block">
                            {customer.cnpj}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div>
                        <strong className="text-xs text-[#0F172A] block font-semibold">
                          {customer.responsavelNome || '—'}
                        </strong>
                        <span className="text-[11px] text-[#64748B] block truncate max-w-[180px]">
                          {customer.email}
                        </span>
                        {customer.telefone && (
                          <a
                            href={`https://wa.me/55${customer.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${customer.responsavelNome || ''}! Aqui é da equipe RSTK...`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] text-[#128C7E] hover:text-[#075E54] font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                            title="Chamar no WhatsApp"
                          >
                            <span className="material-symbols-outlined text-[13px] text-[#25D366]">chat</span>
                            <span>{customer.telefone}</span>
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-[#0F172A]">
                      {customer.address?.cidade ? (
                        <div>
                          <strong>{customer.address.cidade}</strong>
                          <span className="text-[#64748B]"> / {customer.address.uf || '—'}</span>
                          {customer.address.bairro && (
                            <span className="text-[10.5px] text-[#64748B] block">
                              {customer.address.bairro}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Não informado</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {customer.emailVerified ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Verificado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Pendente
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-xs">
                        <strong className="text-[#006782] block font-bold">
                          {customer.ordersCount} pedido(s)
                        </strong>
                        <span className="text-[11px] text-[#64748B]">
                          {formatBRL(customer.totalSpentCents)}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-[#64748B]">
                      {formatDateTimeBR(customer.createdAt)}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomer(customer);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-[#0866c8] hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors shadow-2xs"
                        title="Ver ficha cadastral completa e endereços"
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        <span>Ficha Cadastral</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal / Ficha Cadastral Completa do Cliente */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* Header do Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F7F9FB]">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-blue-600 text-[26px]">
                  storefront
                </span>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                    Ficha Cadastral B2B
                  </span>
                  <h3 className="text-base font-extrabold text-[#0F172A]">
                    {selectedCustomer.nomeFantasia || selectedCustomer.razaoSocial}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-slate-200"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Barra de Ações Rápidas do Cliente */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/70 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-blue-600">verified</span>
                  <div>
                    <strong className="text-xs text-blue-950 font-bold block">
                      {selectedCustomer.emailVerified ? 'Conta Verificada com Sucesso' : 'Confirmação de E-mail Pendente'}
                    </strong>
                    <span className="text-[11px] text-blue-800">
                      Cadastrado em {formatDateTimeBR(selectedCustomer.createdAt)}
                    </span>
                  </div>
                </div>

                {selectedCustomer.telefone && (
                  <a
                    href={`https://wa.me/55${selectedCustomer.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${selectedCustomer.responsavelNome || ''}! Aqui é da equipe RSTK...`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    <span>Chamar no WhatsApp ({selectedCustomer.telefone})</span>
                  </a>
                )}
              </div>

              {/* Dados da Empresa */}
              <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-3 bg-[#F7F9FB]/40">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#006782] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[17px]">domain</span>
                  Dados da Empresa (Pessoa Jurídica)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#64748B] block text-[11px] font-semibold">Razão Social:</span>
                    <strong className="text-[#0F172A]">{selectedCustomer.razaoSocial || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[11px] font-semibold">Nome Fantasia:</span>
                    <strong className="text-[#0F172A]">{selectedCustomer.nomeFantasia || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[11px] font-semibold">CNPJ:</span>
                    <strong className="font-mono text-[#0F172A]">{selectedCustomer.cnpj}</strong>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[11px] font-semibold">Inscrição Estadual (IE):</span>
                    <span className="font-mono text-[#0F172A]">
                      {selectedCustomer.ie || (selectedCustomer.ieIsento ? 'ISENTO' : '—')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contato do Responsável */}
              <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-3 bg-[#F7F9FB]/40">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#006782] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[17px]">badge</span>
                  Contato do Responsável Legal
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#64748B] block text-[11px] font-semibold">Nome Completo:</span>
                    <strong className="text-[#0F172A]">{selectedCustomer.responsavelNome || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[11px] font-semibold">E-mail Comercial (Login):</span>
                    <span className="text-[#0F172A]">{selectedCustomer.email}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[11px] font-semibold">Telefone / WhatsApp:</span>
                    <strong className="font-mono text-[#0F172A]">{selectedCustomer.telefone || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[11px] font-semibold">Status de Autenticação:</span>
                    <span className={`inline-block mt-0.5 text-[11px] font-bold px-2 py-0.5 rounded ${selectedCustomer.emailVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {selectedCustomer.emailVerified ? '✓ E-mail Confirmado' : '⏳ E-mail Pendente'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Endereço Principal de Faturamento e Entrega */}
              <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-2.5 bg-[#F7F9FB]/40">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#006782] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[17px]">location_on</span>
                  Endereço Principal de Faturamento / Entrega
                </h4>
                {selectedCustomer.address && (selectedCustomer.address.logradouro || selectedCustomer.address.cidade) ? (
                  <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg text-xs leading-relaxed text-slate-800">
                    <p className="font-semibold text-sm text-[#0F172A] m-0">
                      {selectedCustomer.address.logradouro}, nº {selectedCustomer.address.numero || 'S/N'}
                      {selectedCustomer.address.complemento ? ` (${selectedCustomer.address.complemento})` : ''}
                    </p>
                    <p className="m-0 text-[#64748B] mt-1">
                      Bairro: <strong>{selectedCustomer.address.bairro || '—'}</strong> · Cidade: <strong>{selectedCustomer.address.cidade}/{selectedCustomer.address.uf}</strong>
                    </p>
                    <p className="m-0 text-[#64748B] mt-0.5 font-mono">
                      CEP: {selectedCustomer.address.cep}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">Endereço não cadastrado.</p>
                )}
              </div>

              {/* Endereços Adicionais */}
              {Array.isArray(selectedCustomer.additionalAddresses) && selectedCustomer.additionalAddresses.length > 0 && (
                <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-2.5 bg-[#F7F9FB]/40">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#006782] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[17px]">forklift</span>
                    Endereços Adicionais de Entrega ({selectedCustomer.additionalAddresses.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedCustomer.additionalAddresses.map((addr, aIdx) => (
                      <div key={aIdx} className="p-3 bg-white border border-[#E2E8F0] rounded-lg text-xs leading-relaxed text-slate-800">
                        <strong className="text-[#0F172A] block text-xs font-bold mb-0.5">
                          {addr.label || `Endereço Adicional #${aIdx + 1}`}
                        </strong>
                        <p className="m-0 text-slate-700">
                          {addr.logradouro}, nº {addr.numero || 'S/N'}
                          {addr.complemento ? ` (${addr.complemento})` : ''} · Bairro: {addr.bairro || '—'} · {addr.cidade}/{addr.uf}
                        </p>
                        <p className="m-0 text-slate-500 font-mono mt-0.5">
                          CEP: {addr.cep}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico de Pedidos Realizados por Esta Loja */}
              <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-3 bg-[#F7F9FB]/40">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#006782] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[17px]">shopping_bag</span>
                    Histórico de Pedidos ({selectedCustomer.orders?.length || 0})
                  </h4>
                  <span className="text-xs font-bold text-[#0F172A]">
                    Total Comprado: {formatBRL(selectedCustomer.totalSpentCents)}
                  </span>
                </div>

                {selectedCustomer.orders && selectedCustomer.orders.length > 0 ? (
                  <div className="border border-[#E2E8F0] rounded-lg overflow-hidden divide-y divide-[#E2E8F0] bg-white text-xs">
                    {selectedCustomer.orders.map((o) => (
                      <div key={o.id} className="p-3 flex items-center justify-between gap-3 hover:bg-[#F7F9FB] transition-colors">
                        <div>
                          <strong className="font-mono text-xs text-[#006782] block">
                            #{o.orderNumber}
                          </strong>
                          <span className="text-[11px] text-[#64748B]">
                            {formatDateTimeBR(o.createdAt)} · {o.itemCount} disco(s)
                          </span>
                          {o.itemsSummary && (
                            <p className="text-[11px] text-slate-700 truncate max-w-sm m-0 mt-0.5">
                              {o.itemsSummary}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <strong className="text-xs font-bold text-[#0F172A] block">
                            {formatBRL(o.totalCents)}
                          </strong>
                          <span className="text-[10px] uppercase font-bold text-[#64748B]">
                            {o.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-2">Nenhum pedido realizado por esta loja até o momento.</p>
                )}
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="px-6 py-4 border-t border-[#E2E8F0] bg-[#F7F9FB] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-xs font-bold text-[#0F172A] hover:bg-slate-100 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
