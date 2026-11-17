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
    label: 'Confirmado / Em Separação',
    badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200',
    dotClass: 'bg-amber-500'
  },
  concluido: {
    label: 'Concluído / Pago',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    dotClass: 'bg-emerald-500'
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
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [editNotes, setEditNotes] = useState('');

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

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchSearch =
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.notes && o.notes.toLowerCase().includes(q)) ||
        o.items.some(
          (it) =>
            it.title.toLowerCase().includes(q) ||
            it.artist.toLowerCase().includes(q)
        );
      return matchStatus && matchSearch;
    });
  }, [orders, search, statusFilter]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const openOrders = orders.filter((o) => o.status === 'whatsapp_aberto').length;
    const completedOrders = orders.filter((o) => o.status === 'concluido').length;
    const totalVolumeCents = orders
      .filter((o) => o.status !== 'cancelado')
      .reduce((sum, o) => sum + (o.totalCents || 0), 0);
    return { totalOrders, openOrders, completedOrders, totalVolumeCents };
  }, [orders]);

  async function handleStatusChange(order, newStatus, restoreStock = false) {
    setUpdatingId(order.id);
    try {
      const res = await apiService.updateOrder(order.id, {
        status: newStatus,
        restoreStock
      });
      if (res.success) {
        onNotify?.(`Pedido ${order.orderNumber} atualizado para ${STATUS_MAP[newStatus]?.label || newStatus}.`);
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
        );
        if (selectedOrder?.id === order.id) {
          setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
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

  async function handleSaveNotes(order) {
    setUpdatingId(order.id);
    try {
      const res = await apiService.updateOrder(order.id, { notes: editNotes });
      if (res.success) {
        onNotify?.('Observações salvas com sucesso.');
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, notes: editNotes } : o))
        );
        setSelectedOrder((prev) => (prev ? { ...prev, notes: editNotes } : null));
      } else {
        onNotify?.(res.error || 'Erro ao salvar notas.', 'error');
      }
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteOrder(order) {
    if (!confirm(`Deseja realmente excluir permanentemente o pedido ${order.orderNumber}?`)) {
      return;
    }
    try {
      const res = await apiService.deleteOrder(order.id);
      if (res.success) {
        onNotify?.(`Pedido ${order.orderNumber} removido.`);
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
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Total de Pedidos
            </span>
            <span className="w-9 h-9 rounded-lg bg-cyan-50 text-[#006782] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
            </span>
          </div>
          <p className="text-3xl font-extrabold text-[#0F172A]">{stats.totalOrders}</p>
          <p className="text-xs text-[#64748B] mt-1">Disparados pelo catálogo</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Abertos no WhatsApp
            </span>
            <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">chat</span>
            </span>
          </div>
          <p className="text-3xl font-extrabold text-[#006782]">{stats.openOrders}</p>
          <p className="text-xs text-[#64748B] mt-1">Aguardando confirmação do lojista</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Concluídos / Pagos
            </span>
            <span className="w-9 h-9 rounded-lg bg-slate-100 text-[#0F172A] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
            </span>
          </div>
          <p className="text-3xl font-extrabold text-[#0F172A]">{stats.completedOrders}</p>
          <p className="text-xs text-[#64748B] mt-1">Pedidos finalizados</p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Volume Estimado
            </span>
            <span className="w-9 h-9 rounded-lg bg-cyan-50 text-[#006782] flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">payments</span>
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#006782]">
            {formatBRL(stats.totalVolumeCents)}
          </p>
          <p className="text-xs text-[#64748B] mt-1">Soma dos pedidos ativos</p>
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
              placeholder="Buscar por código (#PED-...), disco ou artista..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#00C6F7] focus:ring-1 focus:ring-[#00C6F7]"
            />
          </div>

          <div className="w-full sm:w-56">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] bg-white focus:outline-none focus:border-[#00C6F7]"
            >
              <option value="all">Todos os status</option>
              <option value="whatsapp_aberto">Aberto via WhatsApp</option>
              <option value="confirmado">Confirmado / Em Separação</option>
              <option value="concluido">Concluído / Pago</option>
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
            <h3 className="text-base font-bold text-[#0F172A]">Histórico de Pedidos Registrados</h3>
            <p className="text-xs text-[#64748B]">
              Gravados automaticamente antes do redirecionamento para o WhatsApp, com baixa em estoque.
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
                <th className="py-3 px-4">Discos Solicitados</th>
                <th className="py-3 px-4">Qtd. Itens</th>
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
                        Assim que um cliente clicar no botão do WhatsApp no catálogo, o pedido aparecerá aqui com baixa automática de estoque.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.whatsapp_aberto;
                  return (
                    <tr key={order.id} className="hover:bg-[#F7F9FB]/70 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOrder(order);
                            setEditNotes(order.notes || '');
                          }}
                          className="font-mono font-bold text-xs text-[#006782] hover:underline block text-left"
                        >
                          #{order.orderNumber}
                        </button>
                        <span className="text-[11px] text-[#64748B]">
                          {formatDateTimeBR(order.createdAt)}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2 overflow-hidden flex-shrink-0">
                            {order.items.slice(0, 3).map((it, idx) => (
                              <img
                                key={idx}
                                src={it.cover || '/assets/covers/album-01.webp'}
                                alt={it.title}
                                className="inline-block w-8 h-8 rounded-md object-cover border border-white shadow-xs"
                                loading="lazy"
                              />
                            ))}
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <p className="text-xs font-semibold text-[#0F172A] truncate">
                              {order.items[0]?.title || 'Consulta de Catálogo'}
                              {order.items.length > 1 && ` (+${order.items.length - 1} outros)`}
                            </p>
                            <p className="text-[11px] text-[#64748B] truncate">
                              {order.items[0]?.artist || 'RSTK Atacado'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs font-semibold text-[#0F172A]">
                        {order.itemCount} un.
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
                          onClick={() => {
                            setSelectedOrder(order);
                            setEditNotes(order.notes || '');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#006782] hover:bg-cyan-50 rounded-lg mr-1 transition-colors"
                          title="Ver detalhes completos"
                        >
                          <span className="material-symbols-outlined text-[16px]">visibility</span>
                          <span>Detalhes</span>
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

      {/* Modal de Detalhes do Pedido */}
      {selectedOrder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F7F9FB]">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                  Detalhes do Pedido
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
              {/* Status e Ações Rápidas */}
              <div className="bg-[#F7F9FB] border border-[#E2E8F0] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-[#64748B] block mb-1">Status Atual:</span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    STATUS_MAP[selectedOrder.status]?.badgeClass || STATUS_MAP.whatsapp_aberto.badgeClass
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${STATUS_MAP[selectedOrder.status]?.dotClass || 'bg-[#00C6F7]'}`} />
                    {STATUS_MAP[selectedOrder.status]?.label || selectedOrder.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedOrder.status !== 'concluido' && (
                    <button
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => handleStatusChange(selectedOrder, 'concluido')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                    >
                      Marcar Concluído
                    </button>
                  )}
                  {selectedOrder.status !== 'confirmado' && selectedOrder.status !== 'concluido' && (
                    <button
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => handleStatusChange(selectedOrder, 'confirmado')}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                    >
                      Confirmar
                    </button>
                  )}
                  {selectedOrder.status !== 'cancelado' && (
                    <button
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => {
                        const restore = confirm('Deseja devolver os itens deste pedido de volta ao estoque?');
                        handleStatusChange(selectedOrder, 'cancelado', restore);
                      }}
                      className="px-3 py-1.5 bg-white border border-[#F75656] text-[#F75656] hover:bg-red-50 rounded-lg text-xs font-bold transition-colors"
                    >
                      Cancelar Pedido
                    </button>
                  )}
                </div>
              </div>

              {/* Informações Gerais */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-[#64748B] block">Data e Hora:</span>
                  <strong className="text-[#0F172A]">{formatDateTimeBR(selectedOrder.createdAt)}</strong>
                </div>
                <div>
                  <span className="text-[#64748B] block">Origem:</span>
                  <strong className="text-[#0F172A]">{selectedOrder.origin || 'Catálogo Web'}</strong>
                </div>
                <div>
                  <span className="text-[#64748B] block">Valor Total:</span>
                  <strong className="text-[#006782] text-sm">{formatBRL(selectedOrder.totalCents)}</strong>
                </div>
              </div>

              {/* Lista de Itens do Pedido */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-3">
                  Itens Comprados / Selecionados ({selectedOrder.items.length})
                </h4>
                <div className="border border-[#E2E8F0] rounded-xl overflow-hidden divide-y divide-[#E2E8F0]">
                  {selectedOrder.items.map((it, idx) => (
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
                            {it.artist} {it.units && `· ${Number(it.units) === 1 ? 'Álbum Simples' : (Number(it.units) === 2 ? 'Álbum Duplo' : `${it.units} LPs`)}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs text-[#64748B] block">
                          {it.quantity}x {formatBRL(it.priceCents)}
                        </span>
                        <strong className="text-xs font-bold text-[#006782]">
                          {formatBRL(it.priceCents * it.quantity)}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Observações e Notas do Lojista */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#64748B] block">
                  Anotações / Observações Internas
                </label>
                <textarea
                  rows="3"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Ex: Cliente contatou pelo WhatsApp, envio por Sedex pago..."
                  className="w-full p-3 border border-[#E2E8F0] rounded-lg text-xs text-[#0F172A] focus:outline-none focus:border-[#00C6F7] focus:ring-1 focus:ring-[#00C6F7]"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={updatingId === selectedOrder.id}
                    onClick={() => handleSaveNotes(selectedOrder)}
                    className="px-3 py-1.5 bg-[#006782] text-white rounded-lg text-xs font-bold hover:bg-[#005066] transition-colors"
                  >
                    Salvar Observações
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
