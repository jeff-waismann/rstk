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

const STATUS_MAP = {
  whatsapp_aberto: {
    label: 'Enviado / Em Análise',
    badgeClass: 'bg-cyan-50 text-[#006782] border border-cyan-200',
    dotClass: 'bg-[#00C6F7]'
  },
  enviado: {
    label: 'Enviado',
    badgeClass: 'bg-cyan-50 text-[#006782] border border-cyan-200',
    dotClass: 'bg-[#00C6F7]'
  },
  confirmado: {
    label: 'Aprovado / Em Separação',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    dotClass: 'bg-emerald-500'
  },
  aprovado: {
    label: 'Aprovado (Sem Alterações)',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    dotClass: 'bg-emerald-500'
  },
  aprovado_com_alteracoes: {
    label: 'Aprovado c/ Alterações (Aguardando Cliente)',
    badgeClass: 'bg-amber-50 text-amber-800 border border-amber-300',
    dotClass: 'bg-amber-500'
  },
  alteracoes_aceitas: {
    label: 'Alterações Aprovadas pelo Cliente',
    badgeClass: 'bg-teal-50 text-teal-800 border border-teal-300',
    dotClass: 'bg-teal-500'
  },
  despachado: {
    label: 'Despachado',
    badgeClass: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
    dotClass: 'bg-indigo-600'
  },
  concluido: {
    label: 'Concluído / Despachado',
    badgeClass: 'bg-slate-100 text-[#0F172A] border border-slate-300',
    dotClass: 'bg-slate-600'
  },
  cancelado: {
    label: 'Cancelado',
    badgeClass: 'bg-rose-50 text-[#F75656] border border-rose-200',
    dotClass: 'bg-[#F75656]'
  }
};

export default function OrdersTab({ onNotify, onRefreshCatalog }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all'); // all | registered | guest
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editAdminNotes, setEditAdminNotes] = useState('');
  const [modalItems, setModalItems] = useState([]);
  const [showClientDetails, setShowClientDetails] = useState(false);

  async function loadOrders() {
    setLoading(true);
    try {
      const res = await apiService.getOrders({ limit: 200 });
      if (res.success && Array.isArray(res.orders)) {
        setOrders(res.orders);
      } else {
        onNotify?.(res.error || 'Erro ao carregar pedidos.', 'error');
      }
    } catch (err) {
      onNotify?.(err.message || 'Erro de conexão.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  function openOrderDetails(order) {
    setSelectedOrder(order);
    setShowClientDetails(false);
    setEditNotes(order.notes || '');
    setEditAdminNotes(order.adminNotes || '');
    setModalItems(Array.isArray(order.items) ? JSON.parse(JSON.stringify(order.items)) : []);
  }

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchCustomer =
        customerFilter === 'all' ||
        (customerFilter === 'registered' && Boolean(o.customerId || o.customerCnpj)) ||
        (customerFilter === 'guest' && !o.customerId && !o.customerCnpj);

      const matchSearch =
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.customerCnpj && o.customerCnpj.toLowerCase().includes(q)) ||
        (o.notes && o.notes.toLowerCase().includes(q)) ||
        o.items.some(
          (it) =>
            it.title.toLowerCase().includes(q) ||
            it.artist.toLowerCase().includes(q)
        );
      return matchStatus && matchCustomer && matchSearch;
    });
  }, [orders, search, statusFilter, customerFilter]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const registeredOrders = orders.filter((o) => o.customerId || o.customerCnpj).length;
    const openOrders = orders.filter((o) => o.status === 'whatsapp_aberto').length;
    const approvedOrders = orders.filter((o) => o.status === 'confirmado' || o.status === 'aprovado').length;
    const totalVolumeCents = orders
      .filter((o) => o.status !== 'cancelado')
      .reduce((sum, o) => sum + (o.totalCents || 0), 0);
    return { totalOrders, registeredOrders, openOrders, approvedOrders, totalVolumeCents };
  }, [orders]);

  // Modal Item Quantity Change
  function handleItemQuantity(index, newQty) {
    const validQty = Math.max(0, Math.min(99, Number(newQty) || 0));
    setModalItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], quantity: validQty };
      return copy;
    });
  }

  const computedModalTotal = useMemo(() => {
    return modalItems.reduce((sum, it) => sum + ((it.priceCents || 18999) * (it.quantity || 0)), 0);
  }, [modalItems]);

  async function handleStatusChange(order, newStatus, restoreStock = false) {
    setUpdatingId(order.id);
    try {
      const res = await apiService.updateOrder(order.id, {
        status: newStatus,
        restoreStock
      });
      if (res.success) {
        onNotify?.(`Pedido #${order.orderNumber} atualizado para ${STATUS_MAP[newStatus]?.label || newStatus}. Notificação enviada ao cliente.`);
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: newStatus, approvedAt: res.order?.approvedAt || o.approvedAt } : o))
        );
        if (selectedOrder?.id === order.id) {
          setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus, approvedAt: res.order?.approvedAt || prev.approvedAt } : null));
        }
        if (restoreStock) {
          onRefreshCatalog?.();
        }
      } else {
        onNotify?.(res.error || 'Erro ao atualizar pedido.', 'error');
      }
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSaveOrderChanges(order) {
    setUpdatingId(order.id);

    // Identifica quais itens mudaram de quantidade ou estoque
    const changes = [];
    (order.items || []).forEach((origIt, idx) => {
      const updatedIt = modalItems[idx];
      if (updatedIt && updatedIt.quantity !== origIt.quantity) {
        changes.push({
          id: origIt.id,
          title: origIt.title,
          artist: origIt.artist,
          oldQty: origIt.quantity,
          newQty: updatedIt.quantity,
          reason: updatedIt.quantity === 0 ? 'Item esgotado no estoque' : 'Ajuste de quantidade por estoque'
        });
      }
    });

    const isChanged = changes.length > 0;
    const nextStatus = isChanged ? 'aprovado_com_alteracoes' : (order.status === 'whatsapp_aberto' ? 'aprovado' : order.status);

    try {
      const res = await apiService.updateOrder(order.id, {
        items: modalItems,
        totalCents: computedModalTotal,
        notes: editNotes,
        adminNotes: editAdminNotes,
        status: nextStatus,
        changes: changes.length ? changes : (order.changes || null)
      });

      if (res.success && res.order) {
        onNotify?.(
          isChanged
            ? `Alterações salvas! Status atualizado para "Aprovado com Alterações". O cliente poderá aprovar pelo painel.`
            : `Pedido #${order.orderNumber} atualizado com sucesso!`
        );
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? res.order : o))
        );
        setSelectedOrder(res.order);
      } else {
        onNotify?.(res.error || 'Erro ao salvar alterações.', 'error');
      }
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteOrder(order) {
    if (!confirm(`Deseja realmente excluir permanentemente o pedido #${order.orderNumber}?`)) {
      return;
    }
    try {
      const res = await apiService.deleteOrder(order.id);
      if (res.success) {
        onNotify?.(`Pedido #${order.orderNumber} excluído.`);
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
        if (selectedOrder?.id === order.id) setSelectedOrder(null);
      } else {
        onNotify?.(res.error || 'Erro ao excluir pedido.', 'error');
      }
    } catch (err) {
      onNotify?.(err.message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Total de Pedidos
            </span>
            <span className="w-8 h-8 rounded-lg bg-cyan-50 text-[#006782] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#0F172A]">{stats.totalOrders}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Total no sistema</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Revenda Cadastrada
            </span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-[#006782] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#006782]">{stats.registeredOrders}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Vinculados a CNPJ</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Abertos / Análise
            </span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">chat</span>
            </span>
          </div>
          <p className="text-2xl font-extrabold text-amber-600">{stats.openOrders}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Aguardando aprovação</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Aprovados
            </span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
            </span>
          </div>
          <p className="text-2xl font-extrabold text-emerald-700">{stats.approvedOrders}</p>
          <p className="text-[11px] text-[#64748B] mt-1">Em separação / envio</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Volume Estimado
            </span>
            <span className="w-8 h-8 rounded-lg bg-cyan-50 text-[#006782] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">payments</span>
            </span>
          </div>
          <p className="text-xl font-extrabold text-[#006782] truncate">
            {formatBRL(stats.totalVolumeCents)}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">Pedidos ativos</p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] text-[20px]">
              search
            </span>
            <input
              type="text"
              placeholder="Buscar por código (#PED-...), empresa, CNPJ ou vinil..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#00C6F7] focus:ring-1 focus:ring-[#00C6F7]"
            />
          </div>

          <div className="w-full sm:w-52">
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] bg-white focus:outline-none focus:border-[#00C6F7]"
            >
              <option value="all">Todos os clientes</option>
              <option value="registered">🏢 Revenda B2B (Com Cadastro)</option>
              <option value="guest">👤 WhatsApp Avulso (Sem Cadastro)</option>
            </select>
          </div>

          <div className="w-full sm:w-52">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] bg-white focus:outline-none focus:border-[#00C6F7]"
            >
              <option value="all">Todos os status</option>
              <option value="whatsapp_aberto">Enviado / Em Análise</option>
              <option value="aprovado">Aprovado (Sem Alterações)</option>
              <option value="aprovado_com_alteracoes">Aprovado c/ Alterações</option>
              <option value="alteracoes_aceitas">Alterações Aprovadas pelo Cliente</option>
              <option value="despachado">Despachado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={loadOrders}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-[#E2E8F0] rounded-lg text-xs font-bold text-[#0F172A] hover:bg-[#F7F9FB] transition-colors"
          title="Recarregar lista"
        >
          <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
            refresh
          </span>
          <span>Atualizar</span>
        </button>
      </div>

      {/* Tabela de Pedidos */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#0F172A]">Histórico de Pedidos & Revendas</h3>
            <p className="text-xs text-[#64748B]">
              Pedidos associados a contas de revenda (B2B) ou avulsos pelo WhatsApp.
            </p>
          </div>
          <span className="text-xs font-semibold text-[#64748B]">
            {filteredOrders.length} pedido(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F7F9FB] text-xs font-bold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <tr>
                <th className="py-3 px-4">Pedido / Data</th>
                <th className="py-3 px-4">Cliente / Revenda</th>
                <th className="py-3 px-4">Itens</th>
                <th className="py-3 px-4">Valor Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-sm text-[#64748B]">
                    <div className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-[#006782]">progress_activity</span>
                      <span>Carregando pedidos...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-sm text-[#64748B]">
                    <div className="max-w-sm mx-auto space-y-2">
                      <span className="material-symbols-outlined text-4xl text-slate-300">receipt_long</span>
                      <p className="font-semibold text-[#0F172A]">Nenhum pedido encontrado</p>
                      <p className="text-xs text-[#64748B]">
                        Pedidos realizados no catálogo ou na área do cliente aparecerão aqui.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.whatsapp_aberto;
                  const isRegistered = Boolean(order.customerId || order.customerCnpj);

                  return (
                    <tr
                      key={order.id}
                      onClick={() => openOrderDetails(order)}
                      className="hover:bg-[#F7F9FB] transition-colors cursor-pointer group"
                      title="Clique em qualquer lugar da linha para abrir os detalhes do pedido"
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-xs text-[#006782] group-hover:underline block text-left">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          {formatDateTimeBR(order.createdAt)}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {isRegistered ? (
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-blue-600 text-[18px]">domain</span>
                            <div>
                              <strong className="text-xs text-[#0F172A] block font-semibold truncate max-w-[180px]">
                                {order.customerName || 'Revenda Cadastrada'}
                              </strong>
                              <span className="text-[10.5px] text-[#64748B] font-mono block">
                                {order.customerCnpj || 'CNPJ verificado'}
                              </span>
                              {order.customerPhone && (
                                <a
                                  href={`https://wa.me/55${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Aqui é da equipe RSTK. Estamos entrando em contato sobre o pedido #${order.orderNumber}...`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] text-[#128C7E] hover:text-[#075E54] font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:border-emerald-300 transition-colors"
                                  title="Conversar com o cliente no WhatsApp"
                                >
                                  <span className="material-symbols-outlined text-[13px] text-[#25D366]">chat</span>
                                  <span>{order.customerPhone}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[#64748B]">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-slate-400 text-[18px]">person</span>
                              <span className="text-xs italic">WhatsApp Avulso (Sem cadastro)</span>
                            </div>
                            {order.customerPhone && (
                              <a
                                href={`https://wa.me/55${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Aqui é da equipe RSTK. Estamos entrando em contato sobre o pedido #${order.orderNumber}...`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] text-[#128C7E] hover:text-[#075E54] font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:border-emerald-300 transition-colors"
                                title="Conversar com o cliente no WhatsApp"
                              >
                                <span className="material-symbols-outlined text-[13px] text-[#25D366]">chat</span>
                                <span>{order.customerPhone}</span>
                              </a>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2 overflow-hidden flex-shrink-0">
                            {(order.items || []).slice(0, 3).map((it, idx) => (
                              <img
                                key={idx}
                                src={it.cover || '/assets/covers/album-01.webp'}
                                alt={it.title}
                                className="inline-block w-8 h-8 rounded-md object-cover border border-white shadow-xs"
                                loading="lazy"
                              />
                            ))}
                          </div>
                          <div className="min-w-0 max-w-[140px]">
                            <p className="text-xs font-semibold text-[#0F172A] truncate">
                              {order.items[0]?.title || 'Catálogo'}
                              {order.items.length > 1 && ` (+${order.items.length - 1})`}
                            </p>
                            <span className="text-[11px] text-[#64748B] block">
                              {order.itemCount} un.
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs font-extrabold text-[#006782]">
                        {formatBRL(order.totalCents)}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${statusInfo.badgeClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                          {statusInfo.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {order.customerPhone && (
                          <a
                            href={`https://wa.me/55${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Aqui é da equipe RSTK. Estamos entrando em contato sobre o pedido #${order.orderNumber}...`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-[#25D366] hover:bg-[#1ebe5d] rounded-lg mr-1 transition-colors shadow-xs"
                            title={`Chamar no WhatsApp (${order.customerPhone})`}
                          >
                            <span className="material-symbols-outlined text-[15px]">chat</span>
                            <span>WhatsApp</span>
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openOrderDetails(order);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#006782] hover:bg-cyan-50 rounded-lg mr-1 transition-colors"
                          title="Ver detalhes completos e gerenciar pedido"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit_note</span>
                          <span>Gerenciar</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrder(order);
                          }}
                          className="inline-flex items-center p-1.5 text-[#F75656] hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir pedido"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Gestão e Ajuste de Pedido */}
      {selectedOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F7F9FB]">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                  Gestão do Pedido
                </span>
                <h3 className="text-base font-extrabold text-[#0F172A] font-mono">
                  #{selectedOrder.orderNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-slate-200"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Informações do Cliente B2B com Dropdown de Detalhes e Endereços */}
              {selectedOrder.customerCnpj ? (
                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-blue-600">verified</span>
                      Cliente Revenda B2B Vinculado
                    </span>
                    <span className="text-[11px] font-bold bg-blue-200 text-blue-900 px-2 py-0.5 rounded">
                      Conta Cadastrada
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-blue-950">
                    <div>
                      <span className="text-blue-700 block text-[11px]">Razão / Loja:</span>
                      <strong className="text-sm">{selectedOrder.customerName || selectedOrder.customerRazaoSocial || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-blue-700 block text-[11px]">CNPJ:</span>
                      <strong className="font-mono text-xs">{selectedOrder.customerCnpj}</strong>
                    </div>
                    {selectedOrder.customerResponsible && (
                      <div>
                        <span className="text-blue-700 block text-[11px]">Responsável:</span>
                        <strong>{selectedOrder.customerResponsible}</strong>
                      </div>
                    )}
                    {selectedOrder.customerEmail && (
                      <div>
                        <span className="text-blue-700 block text-[11px]">E-mail:</span>
                        <span>{selectedOrder.customerEmail}</span>
                      </div>
                    )}
                    {selectedOrder.customerPhone && (
                      <div className="col-span-full pt-1">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[20px] text-[#25D366]">chat</span>
                            <div>
                              <span className="text-[11px] text-emerald-800 font-semibold block">WhatsApp do Cliente:</span>
                              <strong className="text-sm text-slate-800 font-mono">{selectedOrder.customerPhone}</strong>
                            </div>
                          </div>
                          <a
                            href={`https://wa.me/55${selectedOrder.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Aqui é da equipe RSTK. Estamos entrando em contato sobre o pedido #${selectedOrder.orderNumber}...`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
                          >
                            <span className="material-symbols-outlined text-[16px]">chat</span>
                            <span>Chamar no WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Setinha para expandir/recolher todos os dados cadastrais e endereços */}
                  <div className="mt-3 pt-2.5 border-t border-blue-200/80">
                    <button
                      type="button"
                      onClick={() => setShowClientDetails(!showClientDetails)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-blue-100/50 hover:bg-blue-100 text-xs font-bold text-blue-900 transition-colors"
                      title="Clique para ver ou ocultar ficha cadastral e endereços completos"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[17px] text-blue-700">contact_page</span>
                        <span>{showClientDetails ? 'Ocultar dados cadastrais e endereços' : 'Ver mais infos do cliente e endereços completos'}</span>
                      </span>
                      <span className={`material-symbols-outlined text-[20px] text-blue-700 transition-transform duration-200 ${showClientDetails ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </button>

                    {showClientDetails && (
                      <div className="mt-3 p-3.5 bg-white border border-blue-200 rounded-xl space-y-3.5 text-xs text-slate-800 shadow-2xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2 border-b border-slate-100">
                          <div>
                            <span className="text-[#64748B] block text-[11px] font-semibold">Razão Social:</span>
                            <strong className="text-[#0F172A]">{selectedOrder.customerRazaoSocial || selectedOrder.customerName || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-[#64748B] block text-[11px] font-semibold">Nome Fantasia:</span>
                            <strong className="text-[#0F172A]">{selectedOrder.customerNomeFantasia || selectedOrder.customerName || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-[#64748B] block text-[11px] font-semibold">Inscrição Estadual (IE):</span>
                            <span className="font-mono text-[#0F172A]">{selectedOrder.customerIe || (selectedOrder.customerIeIsento ? 'ISENTO' : '—')}</span>
                          </div>
                          <div>
                            <span className="text-[#64748B] block text-[11px] font-semibold">E-mail Cadastrado:</span>
                            <span className="text-[#0F172A]">{selectedOrder.customerAccountEmail || selectedOrder.customerEmail || '—'}</span>
                            {selectedOrder.customerEmailVerified ? (
                              <span className="ml-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">✓ Verificado</span>
                            ) : (
                              <span className="ml-1.5 text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">Pendente</span>
                            )}
                          </div>
                        </div>

                        {/* Endereço Principal */}
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#006782] flex items-center gap-1 mb-1">
                            <span className="material-symbols-outlined text-[15px]">location_on</span>
                            Endereço Principal de Faturamento / Entrega:
                          </span>
                          {selectedOrder.customerAddress && (selectedOrder.customerAddress.logradouro || selectedOrder.customerAddress.cidade) ? (
                            <p className="m-0 p-2.5 bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg text-slate-800 leading-relaxed font-medium">
                              {selectedOrder.customerAddress.logradouro}, nº {selectedOrder.customerAddress.numero || 'S/N'}
                              {selectedOrder.customerAddress.complemento ? ` (${selectedOrder.customerAddress.complemento})` : ''}
                              {selectedOrder.customerAddress.bairro ? ` · Bairro ${selectedOrder.customerAddress.bairro}` : ''}
                              {selectedOrder.customerAddress.cidade ? ` · ${selectedOrder.customerAddress.cidade}/${selectedOrder.customerAddress.uf || ''}` : ''}
                              {selectedOrder.customerAddress.cep ? ` · CEP: ${selectedOrder.customerAddress.cep}` : ''}
                            </p>
                          ) : (
                            <p className="m-0 p-2.5 bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg text-slate-500 italic">
                              {selectedOrder.deliveryAddress || 'Endereço principal não informado.'}
                            </p>
                          )}
                        </div>

                        {/* Endereços Adicionais */}
                        {Array.isArray(selectedOrder.customerAdditionalAddresses) && selectedOrder.customerAdditionalAddresses.length > 0 && (
                          <div className="pt-2 border-t border-slate-100">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#006782] flex items-center gap-1 mb-1.5">
                              <span className="material-symbols-outlined text-[15px]">warehouse</span>
                              Endereços Adicionais de Entrega ({selectedOrder.customerAdditionalAddresses.length}):
                            </span>
                            <div className="space-y-1.5">
                              {selectedOrder.customerAdditionalAddresses.map((addr, aIdx) => (
                                <div key={aIdx} className="p-2 bg-[#F7F9FB] border border-[#E2E8F0] rounded-lg text-[11.5px] leading-relaxed">
                                  <strong className="text-slate-900 block font-semibold">{addr.label || `Endereço #${aIdx + 1}`}:</strong>
                                  <span className="text-slate-700">
                                    {addr.logradouro}, nº {addr.numero || 'S/N'}
                                    {addr.complemento ? ` (${addr.complemento})` : ''} · {addr.bairro || ''} · {addr.cidade}/{addr.uf} · CEP: {addr.cep}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-slate-400 text-[18px]">info</span>
                      <span>Pedido disparado via WhatsApp avulso (cliente sem cadastro no portal).</span>
                    </div>
                  </div>
                  {selectedOrder.customerPhone && (
                    <div className="mt-2.5 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-[#25D366]">chat</span>
                        <span className="text-xs text-slate-800 font-mono font-bold">{selectedOrder.customerPhone}</span>
                      </div>
                      <a
                        href={`https://wa.me/55${selectedOrder.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Aqui é da equipe RSTK. Estamos entrando em contato sobre o pedido #${selectedOrder.orderNumber}...`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[15px]">chat</span>
                        <span>Chamar no WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Banner de Status de Aprovação das Alterações pelo Cliente */}
              {selectedOrder.changes && selectedOrder.changes.length > 0 && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                  selectedOrder.clientApprovedAt || selectedOrder.status === 'alteracoes_aceitas'
                    ? 'bg-teal-50 border-teal-200 text-teal-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">
                      {selectedOrder.clientApprovedAt || selectedOrder.status === 'alteracoes_aceitas' ? 'verified' : 'pending_actions'}
                    </span>
                    <div>
                      <strong>
                        {selectedOrder.clientApprovedAt || selectedOrder.status === 'alteracoes_aceitas'
                          ? 'Alterações Aprovadas pelo Cliente!'
                          : 'Aguardando Aprovação do Cliente'}
                      </strong>
                      <p className="mt-0.5 text-[11px] opacity-90">
                        {selectedOrder.clientApprovedAt || selectedOrder.status === 'alteracoes_aceitas'
                          ? `Aprovado pelo cliente em ${formatDateTimeBR(selectedOrder.clientApprovedAt || selectedOrder.updatedAt)}. Liberado para despacho!`
                          : 'O cliente foi notificado das alterações e pode aprovar pelo painel dele.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status e Ações Rápidas */}
              <div className="bg-[#F7F9FB] border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-[#64748B] block mb-1">Status Atual:</span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${STATUS_MAP[selectedOrder.status]?.badgeClass || STATUS_MAP.whatsapp_aberto.badgeClass}`}>
                    <span className={`w-2 h-2 rounded-full ${STATUS_MAP[selectedOrder.status]?.dotClass || 'bg-[#00C6F7]'}`} />
                    {STATUS_MAP[selectedOrder.status]?.label || selectedOrder.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedOrder.status !== 'aprovado' && selectedOrder.status !== 'confirmado' && selectedOrder.status !== 'aprovado_com_alteracoes' && selectedOrder.status !== 'alteracoes_aceitas' && selectedOrder.status !== 'despachado' && (
                    <button
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => handleStatusChange(selectedOrder, 'aprovado')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                      title="Aprova o pedido sem alterações"
                    >
                      ✓ Aprovar
                    </button>
                  )}
                  {selectedOrder.status !== 'despachado' && selectedOrder.status !== 'concluido' && selectedOrder.status !== 'cancelado' && (
                    <button
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => {
                        const hasChanges = Boolean(selectedOrder.changes && selectedOrder.changes.length > 0);
                        const clientApproved = Boolean(selectedOrder.clientApprovedAt || selectedOrder.status === 'alteracoes_aceitas');
                        if (hasChanges && !clientApproved) {
                          const proceed = confirm('Atenção: O cliente ainda não aprovou as alterações deste pedido no painel dele. Deseja marcar como despachado mesmo assim?');
                          if (!proceed) return;
                        }
                        handleStatusChange(selectedOrder, 'despachado');
                      }}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <span>🚚 Despachar</span>
                    </button>
                  )}
                  {selectedOrder.status !== 'cancelado' && (
                    <button
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => {
                        const restore = confirm('Deseja devolver os itens deste pedido de volta ao estoque da loja?');
                        handleStatusChange(selectedOrder, 'cancelado', restore);
                      }}
                      className="px-3 py-1.5 bg-white border border-[#F75656] text-[#F75656] hover:bg-red-50 rounded-lg text-xs font-bold transition-colors"
                    >
                      Cancelar Pedido
                    </button>
                  )}
                </div>
              </div>

              {/* Ajuste de Itens e Quantidades */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                    Itens do Pedido ({modalItems.length}) — Ajuste de Quantidade & Estoque
                  </h4>
                  <span className="text-xs text-[#006782] font-bold">
                    Novo Total: {formatBRL(computedModalTotal)}
                  </span>
                </div>
                <div className="border border-[#E2E8F0] rounded-xl overflow-hidden divide-y divide-[#E2E8F0]">
                  {modalItems.map((it, idx) => {
                    const origQty = it.requestedQuantity || (selectedOrder.changes?.find((c) => String(c.id) === String(it.id) || c.title === it.title)?.oldQty) || (selectedOrder.items && (selectedOrder.items[idx]?.requestedQuantity || selectedOrder.items[idx]?.quantity)) || it.quantity;
                    const isCancelled = it.quantity === 0;
                    const isModified = it.quantity !== origQty && !isCancelled;
                    const unitPrice = it.priceCents || 18999;
                    const albumFormat = Number(it.units) === 1 ? 'Álbum Simples' : (Number(it.units) === 2 ? 'Álbum Duplo' : `${it.units || 1} LPs`);

                    return (
                      <div
                        key={idx}
                        className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isCancelled
                            ? 'bg-red-50/80 border-l-4 border-[#EF4444]'
                            : isModified
                            ? 'bg-amber-50/80 border-l-4 border-[#F59E0B]'
                            : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <img
                            src={it.cover || '/assets/covers/album-01.webp'}
                            alt={it.title}
                            className="w-12 h-12 rounded-lg object-cover border border-[#E2E8F0] flex-shrink-0"
                            loading="lazy"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-bold text-sm truncate ${isCancelled ? 'line-through text-[#B91C1C]' : 'text-[#0F172A]'}`}>
                              {it.title}
                            </p>
                            <p className="text-xs text-[#64748B] truncate">
                              {it.artist} · {albumFormat} · {formatBRL(unitPrice)} un.
                            </p>

                            {/* Alertas de Alteração ou Cancelamento */}
                            {isCancelled && (
                              <span className="inline-block mt-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                                🚫 Item Cancelado / Esgotado no estoque
                              </span>
                            )}
                            {isModified && (
                              <span className="inline-block mt-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                ⚠️ Quantidade alterada de {origQty} para {it.quantity} un.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Comparativo de Quantidade (Pedido Original vs Enviado) */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <div className="flex flex-col items-start sm:items-end">
                            <span className="text-[10.5px] text-[#64748B] font-semibold">
                              Pedido original: <strong className="text-[#0F172A]">{origQty} un.</strong>
                            </span>
                            <div className="flex items-center border border-[#E2E8F0] rounded-lg overflow-hidden bg-white mt-1 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleItemQuantity(idx, it.quantity - 1)}
                                className="px-2.5 py-1 text-sm bg-slate-50 hover:bg-slate-200 text-[#0F172A] font-bold"
                                title="Diminuir quantidade"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="0"
                                max="99"
                                value={it.quantity}
                                onChange={(e) => handleItemQuantity(idx, e.target.value)}
                                className="w-12 text-center text-xs font-bold py-1 border-none focus:outline-none"
                                title="Quantidade que será enviada/faturada"
                              />
                              <button
                                type="button"
                                onClick={() => handleItemQuantity(idx, it.quantity + 1)}
                                className="px-2.5 py-1 text-sm bg-slate-50 hover:bg-slate-200 text-[#0F172A] font-bold"
                                title="Aumentar quantidade"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="text-right min-w-[85px]">
                            <span className="text-[10px] text-[#64748B] block">Valor Enviado:</span>
                            {isCancelled ? (
                              <div>
                                <del className="text-[10px] text-red-500 block">{formatBRL(unitPrice * origQty)}</del>
                                <strong className="text-xs font-bold text-[#F75656]">R$ 0,00</strong>
                              </div>
                            ) : isModified ? (
                              <div>
                                <del className="text-[10px] text-amber-600 block">{formatBRL(unitPrice * origQty)}</del>
                                <strong className="text-xs font-extrabold text-[#B45309]">{formatBRL(unitPrice * it.quantity)}</strong>
                              </div>
                            ) : (
                              <strong className="text-xs font-extrabold text-[#006782]">
                                {formatBRL(unitPrice * it.quantity)}
                              </strong>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Justificativa e Notas para o Cliente */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                    Justificativa de Ajustes (Enviada ao cliente no e-mail e painel)
                  </label>
                  <input
                    type="text"
                    value={editAdminNotes}
                    onChange={(e) => setEditAdminNotes(e.target.value)}
                    placeholder="Ex: Item 2 esgotou no fornecedor; quantidade reduzida com sucesso."
                    className="w-full p-2.5 border border-[#E2E8F0] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#00C6F7]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                    Notas Internas da Equipe
                  </label>
                  <textarea
                    rows="2"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Anotações internas sobre frete, pagamento ou expedição..."
                    className="w-full p-2.5 border border-[#E2E8F0] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#00C6F7]"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={updatingId === selectedOrder.id}
                    onClick={() => handleSaveOrderChanges(selectedOrder)}
                    className="px-4 py-2 bg-[#006782] hover:bg-[#005066] text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                  >
                    Salvar Alterações e Notificar Cliente
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#E2E8F0] bg-[#F7F9FB] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 border border-[#E2E8F0] rounded-lg text-xs font-bold text-[#0F172A] hover:bg-slate-100"
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
