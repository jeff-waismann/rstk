import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { apiService } from '../services/api.js';
import DashboardTab from '../components/admin/tabs/DashboardTab.jsx';
import OrdersTab from '../components/admin/tabs/OrdersTab.jsx';
import CustomersTab from '../components/admin/tabs/CustomersTab.jsx';
import CatalogTab from '../components/admin/tabs/CatalogTab.jsx';
import HeroTab from '../components/admin/tabs/HeroTab.jsx';
import SettingsTab from '../components/admin/tabs/SettingsTab.jsx';
import MediaTab from '../components/admin/tabs/MediaTab.jsx';
import UsersTab from '../components/admin/tabs/UsersTab.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'pedidos', label: 'Pedidos', icon: 'shopping_bag' },
  { id: 'clientes', label: 'Lojas / Clientes B2B', icon: 'storefront' },
  { id: 'catalogo', label: 'Catálogo de Vinis', icon: 'album' },
  { id: 'hero', label: 'Hero & Oferta', icon: 'campaign' },
  { id: 'settings', label: 'WhatsApp & SEO', icon: 'settings' },
  { id: 'media', label: 'Biblioteca R2', icon: 'photo_library' },
  { id: 'usuarios', label: 'Usuários', icon: 'group' }
];

function AdminApp() {
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('0x4AAAAAADN7xiosBuzdsddL');

  const [currentTab, setCurrentTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') || 'dashboard';
    return TABS.some((t) => t.id === tab) ? tab : 'dashboard';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTurnstileToken, setLoginTurnstileToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Catalog & settings state
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [toast, setToast] = useState(null);

  function notify(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }

  // Verify HttpOnly session cookie on load
  useEffect(() => {
    (async () => {
      try {
        const res = await apiService.getMe();
        if (res.turnstileSiteKey) {
          setTurnstileSiteKey(res.turnstileSiteKey);
        }
        if (res.authenticated && res.user) {
          setCurrentUser(res.user);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  // Render Turnstile widget on login screen
  useEffect(() => {
    if (!authChecking && !currentUser && turnstileSiteKey) {
      let cancelled = false;
      function tryRender() {
        if (cancelled) return;
        const el = document.getElementById('adminTurnstileContainer');
        if (el && window.turnstile && typeof window.turnstile.render === 'function') {
          el.innerHTML = '';
          try {
            window.turnstile.render(el, {
              sitekey: turnstileSiteKey,
              theme: 'light',
              callback: (token) => setLoginTurnstileToken(token)
            });
          } catch {}
        } else if (!cancelled) {
          setTimeout(tryRender, 200);
        }
      }
      const timer = setTimeout(tryRender, 100);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [authChecking, currentUser, turnstileSiteKey]);

  // Persist active tab in URL query params (F5 persistence)
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', currentTab);
    window.history.replaceState({}, '', url);
  }, [currentTab]);

  // Load D1 catalog & settings when authenticated
  useEffect(() => {
    if (currentUser) {
      loadCatalogData();
    }
  }, [currentUser]);

  async function loadCatalogData() {
    setLoadingData(true);
    try {
      const res = await apiService.getCatalog(true);
      if (res.success) {
        setProducts(res.products || []);
        setSettings(res.settings || {});
      }
    } catch (err) {
      notify('Erro ao carregar dados do D1: ' + err.message, 'error');
    } finally {
      setLoadingData(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const res = await apiService.login(loginEmail, loginPassword, loginTurnstileToken);
      if (res.success && res.user) {
        setCurrentUser(res.user);
        setLoginPassword('');
      } else {
        setLoginError(res.error || 'Falha no login.');
        if (window.turnstile && typeof window.turnstile.reset === 'function') {
          window.turnstile.reset();
        }
      }
    } catch {
      setLoginError('Erro de conexão com o servidor.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await apiService.logout().catch(() => {});
    setCurrentUser(null);
  }

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FB]">
        <div className="flex items-center gap-3 text-[#64748B] text-sm font-medium">
          <span className="material-symbols-outlined animate-spin text-[#00C6F7]">sync</span>
          <span>Verificando sessão...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A] px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="w-full bg-[#0F172A] rounded-xl py-4 px-6 flex items-center justify-center mb-4 shadow-sm border border-slate-800">
              <img
                src="/assets/images/logo-smartweb.svg"
                alt="Smartweb"
                className="h-7 w-auto max-w-[200px] object-contain"
              />
            </div>
            <h1 className="text-lg font-extrabold text-[#0F172A] tracking-tight">
              Smartweb Content Manager
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">Gestão de Catálogo · Cloudflare D1 + R2</p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-[#F75656]/30 text-[#F75656] text-xs font-semibold">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1"
              >
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="seu-email@empresa.com.br"
                className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-bold uppercase tracking-wider text-[#0F172A] mb-1"
              >
                Senha
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#00C6F7]"
              />
            </div>

            {turnstileSiteKey && <div id="adminTurnstileContainer" className="py-1" />}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {loggingIn ? 'Autenticando...' : 'Entrar no Painel'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
            <a href="/" className="hover:text-[#006782] font-medium">
              ← Voltar ao catálogo
            </a>
            <span>Stitch Modern Blue</span>
          </div>
        </div>
      </div>
    );
  }

  const activeTabMeta = TABS.find((t) => t.id === currentTab) || TABS[0];

  return (
    <div className="min-h-screen flex bg-[#F7F9FB]">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (#0F172A) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0F172A] text-white flex flex-col transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <a href="/admin" className="flex items-center" title="Smartweb Content Manager">
            <img
              src="/assets/images/logo-smartweb.svg"
              alt="Smartweb"
              className="h-6 w-auto max-w-[170px] object-contain"
            />
          </a>
          <button
            type="button"
            className="lg:hidden text-slate-400"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {TABS.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCurrentTab(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-[#1E293B] text-white border-l-3 border-[#00C6F7] font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    isActive ? 'text-[#00C6F7]' : 'text-slate-400'
                  }`}
                >
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-xs font-bold text-[#00C6F7]"
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            <span>Abrir Catálogo</span>
          </a>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{currentUser.username}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">
                {currentUser.role}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-[#F75656] hover:bg-slate-800"
              title="Sair"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Canvas (#F7F9FB) */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-[#0F172A] hover:bg-slate-100"
              aria-label="Abrir menu"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div>
              <h2 className="text-lg font-extrabold text-[#0F172A] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#006782]">
                  {activeTabMeta.icon}
                </span>
                <span>{activeTabMeta.label}</span>
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={loadCatalogData}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-semibold text-[#64748B] hover:text-[#0F172A] bg-white"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${loadingData ? 'animate-spin' : ''}`}
            >
              refresh
            </span>
            <span>Sincronizar D1</span>
          </button>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {toast && (
            <div
              role="status"
              className={`mb-5 px-4 py-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                toast.type === 'error'
                  ? 'bg-red-50 border-[#F75656]/40 text-[#F75656]'
                  : 'bg-cyan-50 border-[#00C6F7]/50 text-[#006782]'
              }`}
            >
              <span>{toast.message}</span>
              <button type="button" onClick={() => setToast(null)}>
                ×
              </button>
            </div>
          )}

          {currentTab === 'dashboard' && (
            <DashboardTab
              products={products}
              settings={settings || {}}
              onNavigate={setCurrentTab}
            />
          )}

          {currentTab === 'pedidos' && (
            <OrdersTab
              onNotify={notify}
              onRefreshCatalog={loadCatalogData}
            />
          )}

          {currentTab === 'clientes' && (
            <CustomersTab
              onNotify={notify}
              onNavigate={setCurrentTab}
            />
          )}

          {currentTab === 'catalogo' && (
            <CatalogTab
              products={products}
              defaultPriceCents={settings?.priceCents ?? 18999}
              onReload={loadCatalogData}
              onNotify={notify}
            />
          )}

          {currentTab === 'hero' && (
            <HeroTab
              settings={settings}
              products={products}
              onSaved={loadCatalogData}
              onNotify={notify}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsTab
              settings={settings}
              onSaved={loadCatalogData}
              onNotify={notify}
            />
          )}

          {currentTab === 'media' && <MediaTab onNotify={notify} />}

          {currentTab === 'usuarios' && (
            <UsersTab currentUser={currentUser} onNotify={notify} />
          )}
        </main>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('admin-root');
if (rootEl) {
  createRoot(rootEl).render(<AdminApp />);
}
