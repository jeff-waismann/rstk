import React, { useState, useEffect } from 'react';
import { apiService } from '../../../services/api.js';

export default function UsersTab({ currentUser, onNotify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', email: '', role: 'admin', password: '' });
  const [saving, setSaving] = useState(false);

  const isMaster = currentUser?.role === 'master';

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await apiService.getUsers();
      if (res.success) setUsers(res.users || []);
    } catch (err) {
      onNotify?.('Erro ao carregar usuários: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditing(null);
    setForm({ username: '', email: '', role: 'admin', password: '' });
    setModalOpen(true);
  }

  function openEdit(user) {
    setEditing(user);
    setForm({ username: user.username, email: user.email, role: user.role, password: '' });
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editing
        ? await apiService.updateUser(editing.id, form)
        : await apiService.createUser(form);

      if (res.success) {
        setModalOpen(false);
        onNotify?.(editing ? 'Usuário atualizado!' : 'Usuário criado com sucesso!', 'success');
        await loadUsers();
      } else {
        onNotify?.(res.error || 'Erro ao salvar usuário.', 'error');
      }
    } catch (err) {
      onNotify?.('Erro: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user) {
    if (user.id === currentUser?.id) {
      onNotify?.('Auto-exclusão é estritamente proibida.', 'error');
      return;
    }
    if (!confirm(`Remover o usuário "${user.username}" (${user.email})?`)) return;
    try {
      const res = await apiService.deleteUser(user.id);
      if (res.success) {
        onNotify?.('Usuário removido.', 'success');
        await loadUsers();
      } else {
        onNotify?.(res.error || 'Não foi possível remover.', 'error');
      }
    } catch (err) {
      onNotify?.('Erro: ' + err.message, 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[#0F172A]">Administradores do Painel</h3>
          <p className="text-xs text-[#64748B]">
            Apenas usuários Master podem criar ou remover administradores padrão.
          </p>
        </div>
        {isMaster && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-[18px] text-[#00C6F7]">person_add</span>
            <span>Novo Administrador</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F7F9FB] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              <th className="py-3.5 px-4">Nome</th>
              <th className="py-3.5 px-4">E-mail</th>
              <th className="py-3.5 px-4">Perfil</th>
              <th className="py-3.5 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] text-sm">
            {loading ? (
              <tr>
                <td colSpan="4" className="py-10 text-center text-[#64748B]">
                  Carregando usuários...
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const canEdit = isMaster || isSelf;
                const canDelete = isMaster && !isSelf;
                return (
                  <tr key={user.id} className="hover:bg-[#F7F9FB]">
                    <td className="py-3.5 px-4 font-bold text-[#0F172A]">
                      {user.username}{' '}
                      {isSelf && (
                        <span className="ml-1 text-[10px] px-2 py-0.5 rounded bg-cyan-50 text-[#006782]">
                          Você
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#64748B]">{user.email}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full ${
                          user.role === 'master'
                            ? 'bg-[#0F172A] text-[#00C6F7]'
                            : 'bg-slate-100 text-[#0F172A]'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 rounded-lg mr-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                          <span>Editar</span>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          className="inline-flex items-center p-1.5 text-[#F75656] hover:bg-red-50 rounded-lg"
                          title="Excluir administrador"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F7F9FB]">
              <h3 className="text-base font-bold text-[#0F172A]">
                {editing ? 'Editar Administrador' : 'Novo Administrador'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-[#64748B]"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                  E-mail *
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
                />
              </div>
              {isMaster && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                    Perfil de Acesso
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
                  >
                    <option value="admin">Admin</option>
                    <option value="master">Master</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1">
                  {editing ? 'Nova Senha (deixe vazio para manter)' : 'Senha * (mín. 6 caracteres)'}
                </label>
                <input
                  type="password"
                  required={!editing}
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-xs font-bold uppercase text-[#64748B]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-bold uppercase"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
