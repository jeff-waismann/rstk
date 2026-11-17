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
    label: 'Aberto via WhatsApp',
    badgeClass: 'bg-cyan-50 text-[#006782] border border-cyan-200',
    dotClass: 'bg-[#00C6F7]'
  },
  confirmado: {
    label: 'Aprovado / Em Separação',
    badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200',
    dotClass: 'bg-amber-500'
  },
  aprovado: {
    label: 'Aprovado',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    dotClass: 'bg-emerald-500'
  },
  concluido: {
    label: 'Concluído / Enviado',
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
          title: origIt.title,
          oldQty: origIt.quantity,
          newQty: updatedIt.quantity,
          reason: updatedIt.quantity === 0 ? 'Estoque esgotado' : 'Ajuste de quantidade pelo administrador'
        });
      }
    });

    try {
      const res = await apiService.updateOrder(order.id, {
        items: modalItems,
        totalCents: computedModalTotal,
        notes: editNotes,
        adminNotes: editAdminNotes,
        changes: changes.length ? changes : (order.changes || null)
      });

      if (res.success && res.order) {
        onNotify?.(`Alterações salvas com sucesso no pedido #${order.orderNumber}! E-mail e notificação atualizados.`);
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
              <option value="whatsapp_aberto">Aberto via WhatsApp</option>
              <option value="confirmado">Aprovado / Em Separação</option>
              <option value="aprovado">Aprovado</option>
              <option value="concluido">Concluído / Enviado</option>
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
                    <tr key={order.id} className="hover:bg-[#F7F9FB]/70 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => openOrderDetails(order)}
                          className="font-mono font-bold text-xs text-[#006782] hover:underline block text-left"
                        >
                          #{order.orderNumber}
                        </button>
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
                              <span className="text-[10.5px] text-[#64748B] font-mono">
                                {order.customerCnpj || 'CNPJ verificado'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[#64748B]">
                            <span className="material-symbols-outlined text-slate-400 text-[18px]">person</span>
                            <span className="text-xs italic">WhatsApp Avulso (Sem cadastro)</span>
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
                        <button
                          type="button"
                          onClick={() => openOrderDetails(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#006782] hover:bg-cyan-50 rounded-lg mr-1 transition-colors"
                          title="Ver detalhes completos e ajustar quantidades"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit_note</span>
                          <span>Gerenciar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteOrder(order)}
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
              {/* Informações do Cliente B2B */}
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
                      <span className="text-blue-700 block">Razão / Loja:</span>
                      <strong>{selectedOrder.customerName || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-blue-700 block">CNPJ:</span>
                      <strong className="font-mono">{selectedOrder.customerCnpj}</strong>
                    </div>
                    {selectedOrder.customerEmail && (
                      <div>
                        <span className="text-blue-700 block">E-mail:</span>
                        <span>{selectedOrder.customerEmail}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-center gap-2">
                  <span className="material-symbols-outlined text-slate-400 text-[18px]">info</span>
                  <span>Este pedido foi disparado via WhatsApp avulso (usuário sem cadastro ou não autenticado).</span>
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
                  {selectedOrder.status !== 'aprovado' && selectedOrder.status !== 'confirmado' && (
                    <button
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => handleStatusChange(selectedOrder, 'confirmado')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                      title="Aprova o pedido e notifica o cliente por e-mail e no painel"
                    >
                      ✓ Aprovar Pedido
                    </button>
                  )}
                  {selectedOrder.status !== 'concluido' && (
                    <button
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => handleStatusChange(selectedOrder, 'concluido')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                    >
                      Concluir / Entregue
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
                  {modalItems.map((it, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-white">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={it.cover || '/assets/covers/album-01.webp'}
                          alt={it.title}
                          className="w-12 h-12 rounded-lg object-cover border border-[#E2E8F0] flex-shrink-0"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-[#0F172A] truncate">{it.title}</p>
                          <p className="text-xs text-[#64748B] truncate">
                            {it.artist} · {formatBRL(it.priceCents)} un.
                          </p>
                        </div>
                      </div>

                      {/* Controle de Quantidade */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex items-center border border-[#E2E8F0] rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleItemQuantity(idx, it.quantity - 1)}
                            className="px-2.5 py-1 text-sm bg-slate-50 hover:bg-slate-200 text-[#0F172A]"
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
                          />
                          <button
                            type="button"
                            onClick={() => handleItemQuantity(idx, it.quantity + 1)}
                            className="px-2.5 py-1 text-sm bg-slate-50 hover:bg-slate-200 text-[#0F172A]"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right w-20">
                          <strong className={`text-xs font-bold ${it.quantity === 0 ? 'text-[#F75656] line-through' : 'text-[#006782]'}`}>
                            {it.quantity === 0 ? 'Esgotado' : formatBRL(it.priceCents * it.quantity)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))}
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
