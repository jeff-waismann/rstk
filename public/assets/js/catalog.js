/**
 * RSTK ATACADO — Catálogo de Vinis (Client Controller)
 * Gerencia tema, busca, filtros persistidos na URL, seleção local,
 * modais nativos (<dialog>), integração WhatsApp e hidratação via Cloudflare D1 (/api/catalog).
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const escapeHTML = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  const sanitizeHref = (url) => {
    const raw = String(url ?? '').trim();
    if (!raw) return '#';
    if (raw.startsWith('/') || raw.startsWith('https://') || raw.startsWith('http://')) {
      return raw;
    }
    return '#';
  };

  const normalize = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const formatPriceBRL = (cents) => {
    const numeric = Number.isFinite(Number(cents)) ? Number(cents) / 100 : 0;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(numeric);
  };

  const formatAlbumUnits = (units) => {
    const n = Number(units);
    if (n === 1) return 'Álbum Simples';
    if (n === 2) return 'Álbum Duplo';
    return `${n} LPs`;
  };

  const dateBR = (isoDate) => {
    if (!isoDate) return '—';
    const d = new Date(`${isoDate}T12:00:00`);
    return Number.isNaN(d.getTime()) ? escapeHTML(isoDate) : d.toLocaleDateString('pt-BR');
  };

  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Ignore storage quota errors
      }
    }
  };

  // --- Bootstrap Initial Data (SSR Snapshot) ---
  const bootstrapEl = $('rstk-bootstrap');
  let bootstrap = { settings: {}, products: [] };
  if (bootstrapEl) {
    try {
      bootstrap = JSON.parse(bootstrapEl.textContent || '{}');
    } catch {
      bootstrap = { settings: {}, products: [] };
    }
  }

  let settings = bootstrap.settings || {};
  let catalog = Array.isArray(bootstrap.products) ? bootstrap.products : [];

  // selected is a Map: albumId -> quantity (1..99)
  function loadSavedSelection() {
    const raw = storage.get('rstk-selection', []);
    const map = new Map();
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'number' || typeof item === 'string') {
          const id = Number(item);
          if (catalog.some((album) => Number(album.id) === id)) {
            map.set(id, 1);
          }
        } else if (item && typeof item === 'object' && item.id) {
          const id = Number(item.id);
          const qty = Math.min(99, Math.max(1, Number(item.qty) || 1));
          if (catalog.some((album) => Number(album.id) === id)) {
            map.set(id, qty);
          }
        }
      }
    }
    return map;
  }

  let selected = loadSavedSelection();

  function getTotalItemsCount() {
    let sum = 0;
    for (const qty of selected.values()) {
      sum += qty;
    }
    return sum;
  }

  let activeGenre = '';
  let savedOnly = false;
  let openAlbumId = null;
  let toastTimer = null;

  // --- Theme Controller ---
  function setTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    const lightBtn = $('light');
    const darkBtn = $('dark');
    if (lightBtn) lightBtn.setAttribute('aria-pressed', String(resolved === 'light'));
    if (darkBtn) darkBtn.setAttribute('aria-pressed', String(resolved === 'dark'));
    storage.set('rstk-theme', resolved);
  }

  const savedTheme = storage.get('rstk-theme', 'light');
  setTheme(savedTheme === 'dark' ? 'dark' : 'light');

  $('light')?.addEventListener('click', () => setTheme('light'));
  $('dark')?.addEventListener('click', () => setTheme('dark'));

  // --- URL State Persistence (F5 & Deep-linking) ---
  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    const searchEl = $('search');
    const artistEl = $('artist');
    const formatEl = $('format');
    const sortEl = $('sort');

    if (searchEl && params.has('q')) searchEl.value = params.get('q') || '';
    if (artistEl && params.has('artist')) artistEl.value = params.get('artist') || '';
    if (formatEl && params.has('format')) formatEl.value = params.get('format') || '';
    if (sortEl && params.has('sort')) {
      const sortVal = params.get('sort') || 'artist';
      if (['artist', 'title', 'new', 'old'].includes(sortVal)) {
        sortEl.value = sortVal;
      }
    }
    if (params.has('genre')) activeGenre = params.get('genre') || '';
    if (params.get('saved') === '1') {
      savedOnly = true;
      $('saved-toggle')?.classList.add('active');
      $('saved-toggle')?.setAttribute('aria-pressed', 'true');
    }

    const albumParam = Number(params.get('album'));
    if (albumParam && catalog.some((p) => Number(p.id) === albumParam)) {
      openAlbumId = albumParam;
    }
  }

  function syncUrlState() {
    const url = new URL(window.location.href);
    const searchVal = $('search')?.value.trim() || '';
    const artistVal = $('artist')?.value || '';
    const formatVal = $('format')?.value || '';
    const sortVal = $('sort')?.value || 'artist';

    const setOrDel = (key, val) => {
      if (val) url.searchParams.set(key, val);
      else url.searchParams.delete(key);
    };

    setOrDel('q', searchVal);
    setOrDel('artist', artistVal);
    setOrDel('format', formatVal);
    setOrDel('genre', activeGenre);
    setOrDel('sort', sortVal !== 'artist' ? sortVal : '');
    setOrDel('saved', savedOnly ? '1' : '');
    setOrDel('album', openAlbumId ? String(openAlbumId) : '');

    window.history.replaceState({}, '', url);
  }

  // --- Render Hero & Site Settings ---
  function renderSettingsAndHero() {
    if (settings.seoTitle) document.title = settings.seoTitle;

    const logoEl = $('brand-logo');
    if (logoEl && settings.logoUrl) {
      logoEl.src = sanitizeHref(settings.logoUrl);
      if (settings.brandAlt) logoEl.alt = settings.brandAlt;
    }

    const textMap = {
      'header-tagline': settings.headerTagline,
      'hero-eyebrow': settings.heroEyebrow,
      'hero-title-main': settings.heroTitle,
      'hero-subtitle': settings.heroSubtitle,
      'launch-label': settings.launchLabel,
      'launch-price': formatPriceBRL(settings.priceCents ?? 18999),
      'hero-caption': settings.heroCaption,
      'browse-title': settings.browseTitle,
      'browse-subtitle': settings.browseSubtitle,
      'footer-brand': settings.brandName || 'RSTK',
      'footer-text-primary': settings.footerTextPrimary,
      'footer-text-secondary': settings.footerTextSecondary
    };

    for (const [id, text] of Object.entries(textMap)) {
      const el = $(id);
      if (el && text !== undefined && text !== null) {
        el.textContent = text;
      }
    }

    const validityEl = $('launch-validity');
    if (validityEl) {
      if (settings.validityDate) {
        validityEl.innerHTML = `Até <b>${escapeHTML(settings.validityDate)}</b> ou enquanto durar o estoque.`;
      } else if (settings.validityText) {
        validityEl.textContent = settings.validityText;
      }
    }

    const uniqueArtists = new Set(catalog.map((p) => p.artist));
    const statTitlesEl = $('stat-titles');
    const statArtistsEl = $('stat-artists');
    if (statTitlesEl) statTitlesEl.textContent = String(catalog.length);
    if (statArtistsEl) statArtistsEl.textContent = String(uniqueArtists.size);

    const heroCoversEl = $('hero-covers');
    if (heroCoversEl) {
      const featuredIds = Array.isArray(settings.heroFeaturedIds) && settings.heroFeaturedIds.length
        ? settings.heroFeaturedIds
        : catalog.filter((p) => p.featuredHero).map((p) => p.id);

      const resolvedFeatured = (featuredIds.length ? featuredIds : [7, 28, 24])
        .map((id) => catalog.find((p) => Number(p.id) === Number(id)))
        .filter(Boolean)
        .slice(0, 3);

      const fallbackFeatured = resolvedFeatured.length ? resolvedFeatured : catalog.slice(0, 3);
      heroCoversEl.innerHTML =
        fallbackFeatured
          .map(
            (p) =>
              `<img class="sleeve" src="${escapeHTML(sanitizeHref(p.cover))}" width="235" height="235" alt="${escapeHTML(p.artist)} — ${escapeHTML(p.title)}">`
          )
          .join('') +
        `<span class="hero-caption" id="hero-caption">${escapeHTML(
          settings.heroCaption || 'Álbuns que atravessam gerações'
        )}</span>`;
    }
  }

  // --- Filters & Options ---
  function renderFilterOptions() {
    const artistEl = $('artist');
    if (artistEl) {
      const currentArtist = artistEl.value;
      const allArtists = [...new Set(catalog.map((p) => p.artist))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      );
      artistEl.innerHTML =
        '<option value="">Todos os artistas</option>' +
        allArtists
          .map((artist) => `<option value="${escapeHTML(artist)}">${escapeHTML(artist)}</option>`)
          .join('');
      if (allArtists.includes(currentArtist)) {
        artistEl.value = currentArtist;
      }
    }
  }

  function drawGenres() {
    const genresEl = $('genres');
    if (!genresEl) return;
    const allGenres = [...new Set(catalog.map((p) => p.genre))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    if (activeGenre && !allGenres.includes(activeGenre)) {
      activeGenre = '';
    }
    genresEl.innerHTML = ['', ...allGenres]
      .map(
        (g) =>
          `<button class="chip ${g === activeGenre ? 'active' : ''}" type="button" data-genre="${escapeHTML(
            g
          )}" aria-pressed="${g === activeGenre}">${escapeHTML(g || 'Todos os gêneros')}</button>`
      )
      .join('');
  }

  function getFiltered() {
    const term = normalize($('search')?.value.trim() || '');
    const selectedArtist = $('artist')?.value || '';
    const selectedFormat = $('format')?.value || '';
    const sortMode = $('sort')?.value || 'artist';

    const filtered = catalog.filter(
      (p) =>
        (!term || normalize(`${p.artist} ${p.title} ${p.sourceTitle || ''}`).includes(term)) &&
        (!activeGenre || p.genre === activeGenre) &&
        (!selectedArtist || p.artist === selectedArtist) &&
        (!selectedFormat || Number(p.units) === Number(selectedFormat)) &&
        (!savedOnly || selected.has(Number(p.id)))
    );

    return filtered.sort((a, b) => {
      if (sortMode === 'title') return a.title.localeCompare(b.title, 'pt-BR');
      if (sortMode === 'new') return String(b.date).localeCompare(String(a.date));
      if (sortMode === 'old') return String(a.date).localeCompare(String(b.date));
      return a.artist.localeCompare(b.artist, 'pt-BR') || Number(a.id) - Number(b.id);
    });
  }

  function draw() {
    const arr = getFiltered();
    const resultEl = $('result-count');
    if (resultEl) {
      resultEl.textContent = `${arr.length} de ${catalog.length} títulos${savedOnly ? ' · Meu pedido' : ''
        }`;
    }

    const gridEl = $('grid');
    if (gridEl) {
      gridEl.innerHTML = arr.length
        ? arr
          .map((p) => {
            const id = Number(p.id);
            const isInCart = selected.has(id);
            const currentQty = isInCart ? (selected.get(id) || 1) : 1;
            const unitLabel = formatAlbumUnits(p.units);
            const isSoldOut = !p.active || (typeof p.stock === 'number' && p.stock <= 0);
            return `<article class="card ${isSoldOut ? 'sold-out' : ''}" data-id="${id}">
                <div class="art">
                  <button class="art-open" type="button" data-detail="${id}" aria-label="Ver detalhes de ${escapeHTML(p.title)}">
                    <img src="${escapeHTML(sanitizeHref(p.cover))}" loading="lazy" decoding="async" width="600" height="600" alt="Capa de ${escapeHTML(p.title)}, ${escapeHTML(p.artist)}">
                  </button>
                  <span class="lp">${escapeHTML(unitLabel)}</span>
                  ${isSoldOut ? '<span class="ribbon-sold-out" aria-label="Esgotado">ESGOTADO</span>' : ''}
                </div>
                <div class="card-info">
                  <p class="artist">${escapeHTML(p.artist)}</p>
                  <button class="title" type="button" data-detail="${id}">${escapeHTML(p.title)}</button>
                  <p class="genre">${escapeHTML(p.genre)}</p>
                  <div class="card-bottom">
                    <button class="detail-btn" type="button" data-detail="${id}">Conheça o disco <span>↗</span></button>
                    <div class="card-order-controls">
                      <div class="qty-control" role="group" aria-label="Quantidade">
                        <button type="button" class="qty-btn" data-qty-dec="${id}" aria-label="Diminuir quantidade">−</button>
                        <input
                          type="number"
                          class="qty-input"
                          data-qty-input="${id}"
                          min="1"
                          max="99"
                          value="${currentQty}"
                          aria-label="Quantidade de ${escapeHTML(p.title)}"
                        />
                        <button type="button" class="qty-btn" data-qty-inc="${id}" aria-label="Aumentar quantidade">+</button>
                      </div>
                      <button
                        type="button"
                        class="btn-add-cart ${isSoldOut ? 'disabled-sold-out' : ''} ${isInCart ? 'in-cart' : ''}"
                        data-add-cart="${id}"
                        aria-label="${isSoldOut ? 'Produto esgotado: ' + escapeHTML(p.title) : (isInCart ? 'Atualizar quantidade no pedido' : 'Adicionar ' + escapeHTML(p.title) + ' ao pedido')}"
                        title="${isSoldOut ? 'Produto esgotado' : (isInCart ? 'No pedido (clique para atualizar)' : 'Adicionar ao pedido')}"
                      >
                        <svg class="cart-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <circle cx="9" cy="21" r="1.3"></circle>
                          <circle cx="20" cy="21" r="1.3"></circle>
                          <path d="M1 1h4l2.6 13a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H6"></path>
                        </svg>
                        <span class="cart-plus-badge">${isInCart ? '✓' : '+'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>`;
          })
          .join('')
        : '<div class="empty"><h3>Nenhum disco por aqui.</h3><p>Tente outra busca ou limpe os filtros.</p><button class="primary" type="button" data-clear>Ver todos os títulos</button></div>';
    }

    updateSelection();
    syncUrlState();
  }

  // --- Selection & WhatsApp Integration ---
  function selectionText() {
    const items = catalog
      .filter((p) => selected.has(Number(p.id)))
      .map((p) => {
        const qty = selected.get(Number(p.id)) || 1;
        const unitLabel = formatAlbumUnits(p.units);
        return `• ${qty}x ${p.artist} — ${p.title} (${unitLabel})`;
      })
      .join('\n');
    return (
      'Olá, RSTK! Gostaria de consultar valores e disponibilidade dos seguintes vinis:\n\n' +
      items +
      '\n\nPodem confirmar as edições e as condições de compra?'
    );
  }

  function updateWhatsApp() {
    const phone = String(settings.whatsappNumber || '553488293565').replace(/\D/g, '');
    const defaultMsg =
      settings.whatsappDefaultMessage ||
      `Olá, RSTK! Tenho interesse nos vinis lacrados e importados para minha loja. Gostaria de saber mais sobre as vendas no atacado e a oferta de lançamento de ${formatPriceBRL(
        settings.priceCents ?? 18999
      )}.`;
    const message = selected.size ? selectionText() : defaultMsg;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    for (const id of ['whatsapp-modal', 'whatsapp-floating']) {
      const el = $(id);
      if (el) el.href = url;
    }
    document.body.classList.toggle('has-selection', selected.size > 0);
  }

  function updateSelection() {
    updateWhatsApp();
    const totalCount = getTotalItemsCount();
    const savedCountEl = $('saved-count');
    const barCountEl = $('bar-count');
    const selectionBarEl = $('selectionbar');
    if (savedCountEl) savedCountEl.textContent = String(totalCount);
    if (barCountEl) barCountEl.textContent = String(totalCount);
    if (selectionBarEl) selectionBarEl.hidden = selected.size === 0;

    const listToStore = [];
    for (const [id, qty] of selected.entries()) {
      listToStore.push({ id, qty });
    }
    storage.set('rstk-selection', listToStore);

    const emptyBtn = $('empty-selection');
    if (emptyBtn) emptyBtn.disabled = selected.size === 0;

    const submitOrderBtn = $('btn-submit-order');
    if (submitOrderBtn) submitOrderBtn.disabled = selected.size === 0;
  }

  function handleQuantityChange(id, delta) {
    const numericId = Number(id);
    const input = document.querySelector(`input[data-qty-input="${numericId}"]`);
    if (!input) return;
    let currentVal = parseInt(input.value, 10);
    if (isNaN(currentVal)) currentVal = 1;
    let nextVal = Math.min(99, Math.max(1, currentVal + delta));
    input.value = nextVal;

    if (selected.has(numericId)) {
      selected.set(numericId, nextVal);
      updateSelection();
      if ($('selection')?.open) renderSelection();
      const detailInput = $('detail-qty-input');
      if (detailInput && openAlbumId === numericId) {
        detailInput.value = nextVal;
      }
    }
  }

  function addToCart(id, explicitQty = null) {
    const numericId = Number(id);
    const album = catalog.find((p) => Number(p.id) === numericId);
    if (!album) return;

    const isSoldOut = !album.active || (typeof album.stock === 'number' && album.stock <= 0);
    if (isSoldOut) {
      toast(`O vinil "${album.title}" está esgotado e não pode ser adicionado à lista.`);
      return;
    }

    let qty = explicitQty;
    if (qty === null) {
      const input = document.querySelector(`input[data-qty-input="${numericId}"]`);
      qty = input ? parseInt(input.value, 10) : 1;
    }
    if (isNaN(qty) || qty < 1) qty = 1;
    if (qty > 99) qty = 99;

    const alreadyInCart = selected.has(numericId);
    selected.set(numericId, qty);
    updateSelection();
    draw();

    if ($('detail')?.open) showDetail(numericId, false);
    if ($('selection')?.open) renderSelection();

    if (alreadyInCart) {
      toast(`Quantidade de "${album.title}" atualizada para ${qty} un.!`);
    } else {
      toast(`"${album.title}" (${qty} un.) adicionado ao seu pedido! 🛒`);
    }
  }

  function removeFromCart(id) {
    const numericId = Number(id);
    const album = catalog.find((p) => Number(p.id) === numericId);
    if (selected.has(numericId)) {
      selected.delete(numericId);
      updateSelection();
      draw();
      if ($('detail')?.open) showDetail(numericId, false);
      if ($('selection')?.open) renderSelection();
      if (album) toast(`"${album.title}" removido do pedido.`);
    }
  }

  function showDetail(id, open = true) {
    const numericId = Number(id);
    const album = catalog.find((p) => Number(p.id) === numericId);
    if (!album) return;

    openAlbumId = numericId;
    const isInCart = selected.has(numericId);
    const currentQty = isInCart ? (selected.get(numericId) || 1) : 1;
    const priceDisplay = formatPriceBRL(album.priceCents ?? settings.priceCents ?? 18999);
    const noteText =
      settings.detailNote ||
      `Preço único de lançamento até ${settings.validityDate || '30/11/2026'} ou enquanto durar o estoque. A capa identifica o álbum; confirme os detalhes da edição física antes do pedido.`;

    const detailBody = $('detail-body');
    if (detailBody) {
      const isSoldOut = !album.active || (typeof album.stock === 'number' && album.stock <= 0);
      const sourceHref = sanitizeHref(album.source);
      detailBody.innerHTML = `<div class="modal-grid">
        <div class="modal-art-box">
          <img class="modal-art" src="${escapeHTML(sanitizeHref(album.cover))}" alt="Capa de ${escapeHTML(album.title)}">
          ${isSoldOut ? '<span class="ribbon-sold-out modal-ribbon" aria-label="Esgotado">ESGOTADO</span>' : ''}
        </div>
        <div class="modal-info">
          <button class="close" type="button" data-close aria-label="Fechar detalhes">×</button>
          <p class="eyebrow">${escapeHTML(album.artist)}</p>
          <h2 id="detail-title">${escapeHTML(album.title)}</h2>
          <dl>
            <div><dt>Gênero</dt><dd>${escapeHTML(album.genre)}</dd></div>
            <div><dt>Formato na lista</dt><dd>${formatAlbumUnits(album.units)}</dd></div>
            <div><dt>Data da edição na lista</dt><dd>${dateBR(album.date)}</dd></div>
            <div><dt>Preço de lançamento</dt><dd>${escapeHTML(priceDisplay)}</dd></div>
            <div><dt>Disponibilidade</dt><dd style="${isSoldOut ? 'color:#DC2626;font-weight:700;' : ''}">${isSoldOut ? '🔴 ESGOTADO' : (typeof album.stock === 'number' ? `${album.stock} un. em estoque` : '30 un.')
        }</dd></div>
          </dl>
          <div style="display:flex;flex-direction:column;gap:0.75rem;margin-top:0.75rem;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="qty-control" role="group" aria-label="Quantidade" style="height:38px;">
                <button type="button" class="qty-btn" data-detail-qty-dec="${numericId}" style="width:32px;height:38px;font-size:16px;">−</button>
                <input
                  type="number"
                  class="qty-input"
                  id="detail-qty-input"
                  data-detail-qty-input="${numericId}"
                  min="1"
                  max="99"
                  value="${currentQty}"
                  style="width:42px;height:38px;font-size:14px;"
                  aria-label="Quantidade de ${escapeHTML(album.title)}"
                />
                <button type="button" class="qty-btn" data-detail-qty-inc="${numericId}" style="width:32px;height:38px;font-size:16px;">+</button>
              </div>
              <button
                class="primary"
                type="button"
                data-detail-add-cart="${numericId}"
                style="flex:1;height:38px;display:flex;align-items:center;justify-content:center;gap:8px;${isSoldOut ? 'background:#334155;border-color:#475569;cursor:not-allowed;' : (isInCart ? 'background:#10B981;border-color:#059669;' : '')}"
              >
                <span>${isSoldOut ? '✕ Disco Esgotado' : (isInCart ? '✓ No Pedido · Atualizar' : '🛒 + Adicionar ao Pedido')}</span>
              </button>
            </div>
            <div id="modal-sold-out-notice" style="color:#DC2626;font-size:12px;font-weight:700;text-align:center;padding:4px 0;" hidden></div>
          </div>
          <p class="note">${escapeHTML(noteText)}</p>
          ${sourceHref !== '#'
          ? `<a class="source" href="${escapeHTML(sourceHref)}" target="_blank" rel="noopener noreferrer">Fonte da capa ↗</a>`
          : ''
        }
        </div>
      </div>`;
    }

    const detailDialog = $('detail');
    if (open && detailDialog && !detailDialog.open) {
      detailDialog.showModal();
    }
    syncUrlState();
  }

  function renderSelection() {
    const listEl = $('selected-list');
    if (listEl) {
      const items = catalog.filter((p) => selected.has(Number(p.id)));
      let totalCents = 0;
      let totalQty = 0;

      listEl.innerHTML = items.length
        ? items
          .map((p) => {
            const id = Number(p.id);
            const qty = selected.get(id) || 1;
            const unitPrice = p.priceCents ?? settings.priceCents ?? 18999;
            const subtotal = unitPrice * qty;
            totalCents += subtotal;
            totalQty += qty;
            return `<li>
                <img src="${escapeHTML(sanitizeHref(p.cover))}" alt="">
                <div style="flex:1;min-width:0;">
                  <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(p.title)}</strong>
                  <small>${escapeHTML(p.artist)} · ${formatAlbumUnits(p.units)}</small>
                  <div style="font-size:11px;color:var(--ink);opacity:0.8;margin-top:2px;">
                    ${formatPriceBRL(unitPrice)} un.
                  </div>
                </div>
                <div class="cart-item-controls" style="display:flex;align-items:center;gap:6px;">
                  <div class="qty-control" role="group" aria-label="Quantidade" style="height:28px;">
                    <button type="button" class="qty-btn" data-cart-dec="${id}" style="width:22px;height:28px;font-size:12px;">−</button>
                    <input
                      type="number"
                      class="qty-input"
                      data-cart-input="${id}"
                      min="1"
                      max="99"
                      value="${qty}"
                      style="width:28px;height:28px;font-size:11px;"
                      aria-label="Quantidade de ${escapeHTML(p.title)}"
                    />
                    <button type="button" class="qty-btn" data-cart-inc="${id}" style="width:22px;height:28px;font-size:12px;">+</button>
                  </div>
                  <span class="cart-item-subtotal" style="font-size:12px;font-weight:700;color:var(--blue);min-width:70px;text-align:right;">
                    ${formatPriceBRL(subtotal)}
                  </span>
                  <button type="button" class="cart-item-remove" data-cart-remove="${id}" aria-label="Remover ${escapeHTML(p.title)}">×</button>
                </div>
              </li>`;
          })
          .join('') +
        `<li style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;font-weight:700;border-top:2px solid var(--line);border-bottom:none;">
            <span>Total (${totalQty} ${totalQty === 1 ? 'vinil' : 'vinis'}):</span>
            <span style="font-size:16px;color:var(--blue);">${formatPriceBRL(totalCents)}</span>
          </li>`
        : '<li>Sua seleção está vazia.</li>';
    }
    const fallbackEl = $('copy-fallback');
    if (fallbackEl) fallbackEl.hidden = true;
    updateSelection();
  }

  function clearFilters() {
    activeGenre = '';
    savedOnly = false;
    if ($('search')) $('search').value = '';
    if ($('artist')) $('artist').value = '';
    if ($('format')) $('format').value = '';
    if ($('sort')) $('sort').value = 'artist';
    $('saved-toggle')?.classList.remove('active');
    $('saved-toggle')?.setAttribute('aria-pressed', 'false');
    drawGenres();
    draw();
  }

  function toast(message) {
    const toastEl = $('toast');
    if (toastEl) {
      toastEl.textContent = message;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastEl.hidden = true;
      }, 3200);
    }
    const modalNotice = $('modal-sold-out-notice');
    if (modalNotice) {
      modalNotice.textContent = message;
      modalNotice.hidden = false;
      setTimeout(() => {
        if (modalNotice) modalNotice.hidden = true;
      }, 3200);
    }
  }

  async function dispatchWhatsAppOrder(event, sourceEl, singleAlbumId = null) {
    if (event) event.preventDefault();

    let items = [];
    if (singleAlbumId) {
      const p = catalog.find((x) => Number(x.id) === Number(singleAlbumId));
      if (p) {
        const detailInput = $('detail-qty-input');
        const cardInput = document.querySelector(`input[data-qty-input="${singleAlbumId}"]`);
        const chosenQty = detailInput ? parseInt(detailInput.value, 10) : (cardInput ? parseInt(cardInput.value, 10) : 1);
        const validQty = Math.min(99, Math.max(1, isNaN(chosenQty) ? 1 : chosenQty));
        items = [{
          id: Number(p.id),
          title: p.title,
          artist: p.artist,
          units: Number(p.units) || 1,
          priceCents: p.priceCents ?? settings.priceCents ?? 18999,
          quantity: validQty,
          cover: p.cover
        }];
      }
    } else if (selected.size > 0) {
      const selectedItems = catalog.filter((p) => selected.has(Number(p.id)));
      items = selectedItems.map((p) => ({
        id: Number(p.id),
        title: p.title,
        artist: p.artist,
        units: Number(p.units) || 1,
        priceCents: p.priceCents ?? settings.priceCents ?? 18999,
        quantity: selected.get(Number(p.id)) || 1,
        cover: p.cover
      }));
    } else if (openAlbumId) {
      const p = catalog.find((x) => Number(x.id) === Number(openAlbumId));
      if (p) {
        items = [{
          id: Number(p.id),
          title: p.title,
          artist: p.artist,
          units: Number(p.units) || 1,
          priceCents: p.priceCents ?? settings.priceCents ?? 18999,
          quantity: 1,
          cover: p.cover
        }];
      }
    }

    const totalCents = items.reduce((s, it) => s + it.priceCents * it.quantity, 0) || (settings.priceCents ?? 18999);
    let orderNumber = '';

    if (sourceEl) {
      sourceEl.setAttribute('aria-busy', 'true');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          totalCents,
          origin: singleAlbumId ? 'modal_single_buy' : (sourceEl?.id === 'whatsapp-modal' ? 'modal_selection' : 'floating_whatsapp'),
          notes: items.length
            ? `Pedido de ${items.reduce((sum, it) => sum + it.quantity, 0)} vinil(is) solicitado via WhatsApp`
            : 'Consulta geral de catálogo via WhatsApp'
        }),
        signal: controller.signal,
        keepalive: true
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data?.order?.orderNumber) {
          orderNumber = data.order.orderNumber;
          for (const it of items) {
            const found = catalog.find((c) => Number(c.id) === Number(it.id));
            if (found && typeof found.stock === 'number') {
              found.stock = Math.max(0, found.stock - it.quantity);
            }
          }
          draw();
          if ($('detail')?.open && openAlbumId) {
            showDetail(openAlbumId, false);
          }
          toast(`Pedido #${orderNumber} gravado! Abrindo WhatsApp...`);
        }
      }
    } catch (err) {
      console.warn('Registro de pedido offline ou excedeu tempo limite:', err);
    } finally {
      if (sourceEl) {
        sourceEl.removeAttribute('aria-busy');
      }
    }

    const phone = String(settings.whatsappNumber || '553488293565').replace(/\D/g, '');
    let message = '';
    if (singleAlbumId && items.length === 1) {
      const it = items[0];
      const unitLabel = formatAlbumUnits(it.units);
      message = `Olá, RSTK! Gostaria de encomendar no atacado o vinil lacrado:\n\n• ${it.quantity}x ${it.artist} — ${it.title} (${unitLabel})\n\nPodem confirmar o envio e as condições de pagamento?`;
    } else if (selected.size > 0) {
      message = selectionText();
    } else {
      message = settings.whatsappDefaultMessage || `Olá, RSTK! Tenho interesse nos vinis lacrados e importados para minha loja. Gostaria de saber mais sobre as vendas no atacado e a oferta de lançamento de ${formatPriceBRL(settings.priceCents ?? 18999)}.`;
    }

    if (orderNumber) {
      message += `\n\n*(Pedido registrado: #${orderNumber})*`;
    }

    const finalUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');

    // Limpa a lista do usuário após o envio e gravação do pedido para que ele comece de novo
    if (!singleAlbumId && items.length > 0) {
      selected.clear();
      updateSelection();
      if ($('selection')?.open) {
        $('selection').close();
      }
      renderSelection();
      draw();
    }
  }

  // --- Client Auth Status Hydration & Direct Order Submission ---
  let currentClient = null;

  async function initClientAuthState() {
    try {
      const res = await fetch('/api/client/me', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.loggedIn && data?.client) {
        currentClient = data.client;
        const displayName = currentClient.nomeFantasia || currentClient.razaoSocial || 'Área do Cliente';
        const shortName = displayName.length > 18 ? displayName.slice(0, 16) + '…' : displayName;

        const headerBtn = $('header-login-btn');
        const headerText = $('header-login-text');
        if (headerBtn) {
          headerBtn.href = '/cliente/pedidos';
          headerBtn.title = `Conectado como ${displayName}`;
          if (headerText) headerText.textContent = shortName;
        }
      }
    } catch {
      // Ignora falhas de rede no check de sessão
    }
  }

  async function dispatchDirectOrder() {
    if (selected.size === 0) {
      toast('Seu carrinho está vazio. Adicione vinis antes de enviar.');
      return;
    }

    if (!currentClient) {
      try {
        const checkRes = await fetch('/api/client/me', { cache: 'no-store' });
        const checkData = await checkRes.json();
        if (checkData?.loggedIn && checkData?.client) {
          currentClient = checkData.client;
        }
      } catch (e) { }
    }

    if (!currentClient) {
      toast('Faça login ou cadastre sua loja para enviar o pedido diretamente. Redirecionando...');
      setTimeout(() => {
        window.location.href = '/cliente/login?from=cart';
      }, 700);
      return;
    }

    const submitBtn = $('btn-submit-order');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando Pedido...';
    }

    const selectedItems = catalog.filter((p) => selected.has(Number(p.id)));
    const items = selectedItems.map((p) => ({
      id: Number(p.id),
      title: p.title,
      artist: p.artist,
      units: Number(p.units) || 1,
      priceCents: p.priceCents ?? settings.priceCents ?? 18999,
      quantity: selected.get(Number(p.id)) || 1,
      cover: p.cover
    }));
    const totalCents = items.reduce((s, it) => s + it.priceCents * it.quantity, 0) || (settings.priceCents ?? 18999);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          totalCents,
          origin: 'portal_direct_submit',
          notes: `Pedido direto de ${items.reduce((s, it) => s + it.quantity, 0)} vinil(is) enviado pelo painel do lojista`
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.order?.orderNumber) {
        const orderNum = data.order.orderNumber;

        for (const it of items) {
          const found = catalog.find((c) => Number(c.id) === Number(it.id));
          if (found && typeof found.stock === 'number') {
            found.stock = Math.max(0, found.stock - it.quantity);
          }
        }

        selected.clear();
        updateSelection();
        if ($('selection')?.open) {
          $('selection').close();
        }
        renderSelection();
        draw();

        toast(`Pedido #${orderNum} enviado com sucesso! Abrindo seus pedidos...`);
        setTimeout(() => {
          window.location.href = '/cliente/pedidos';
        }, 900);
      } else {
        toast(data?.error || 'Erro ao enviar pedido.');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar Pedido';
        }
      }
    } catch (err) {
      toast('Erro de conexão ao enviar pedido. Tente novamente.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Pedido';
      }
    }
  }

  $('view-selection')?.addEventListener('click', () => {
    renderSelection();
    $('selection')?.showModal();
  });

  $('close-selection')?.addEventListener('click', () => $('selection')?.close());

  $('empty-selection')?.addEventListener('click', () => {
    selected.clear();
    draw();
    renderSelection();
  });

  $('saved-toggle')?.addEventListener('click', () => {
    savedOnly = !savedOnly;
    $('saved-toggle')?.classList.toggle('active', savedOnly);
    $('saved-toggle')?.setAttribute('aria-pressed', String(savedOnly));
    draw();
  });

  $('detail')?.addEventListener('close', () => {
    openAlbumId = null;
    syncUrlState();
  });

  $('btn-submit-order')?.addEventListener('click', dispatchDirectOrder);
  $('whatsapp-modal')?.addEventListener('click', (e) => dispatchWhatsAppOrder(e, $('whatsapp-modal')));
  $('whatsapp-floating')?.addEventListener('click', (e) => dispatchWhatsAppOrder(e, $('whatsapp-floating')));

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-detail],[data-genre],[data-close],[data-clear],[data-buy-now],[data-qty-dec],[data-qty-inc],[data-add-cart],[data-detail-qty-dec],[data-detail-qty-inc],[data-detail-add-cart],[data-cart-dec],[data-cart-inc],[data-cart-remove]')
      : null;
    if (!target) return;

    if (target.hasAttribute('data-buy-now')) {
      dispatchWhatsAppOrder(event, target, Number(target.getAttribute('data-buy-now')));
    } else if (target.hasAttribute('data-detail')) {
      showDetail(Number(target.getAttribute('data-detail')));
    } else if (target.hasAttribute('data-qty-dec')) {
      handleQuantityChange(Number(target.getAttribute('data-qty-dec')), -1);
    } else if (target.hasAttribute('data-qty-inc')) {
      handleQuantityChange(Number(target.getAttribute('data-qty-inc')), 1);
    } else if (target.hasAttribute('data-add-cart')) {
      addToCart(Number(target.getAttribute('data-add-cart')));
    } else if (target.hasAttribute('data-detail-qty-dec')) {
      const input = $('detail-qty-input');
      if (input) {
        let v = parseInt(input.value, 10) || 1;
        input.value = Math.max(1, v - 1);
      }
    } else if (target.hasAttribute('data-detail-qty-inc')) {
      const input = $('detail-qty-input');
      if (input) {
        let v = parseInt(input.value, 10) || 1;
        input.value = Math.min(99, v + 1);
      }
    } else if (target.hasAttribute('data-detail-add-cart')) {
      const input = $('detail-qty-input');
      const qty = input ? parseInt(input.value, 10) : 1;
      addToCart(Number(target.getAttribute('data-detail-add-cart')), qty);
    } else if (target.hasAttribute('data-cart-dec')) {
      const id = Number(target.getAttribute('data-cart-dec'));
      const cur = selected.get(id) || 1;
      if (cur > 1) {
        selected.set(id, cur - 1);
        updateSelection();
        renderSelection();
        draw();
      } else {
        removeFromCart(id);
      }
    } else if (target.hasAttribute('data-cart-inc')) {
      const id = Number(target.getAttribute('data-cart-inc'));
      const cur = selected.get(id) || 1;
      if (cur < 99) {
        selected.set(id, cur + 1);
        updateSelection();
        renderSelection();
        draw();
      }
    } else if (target.hasAttribute('data-cart-remove')) {
      removeFromCart(Number(target.getAttribute('data-cart-remove')));
    } else if (target.hasAttribute('data-genre')) {
      activeGenre = target.getAttribute('data-genre') || '';
      drawGenres();
      draw();
    } else if (target.hasAttribute('data-close')) {
      $('detail')?.close();
    } else if (target.hasAttribute('data-clear')) {
      clearFilters();
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && (target.hasAttribute('data-qty-input') || target.hasAttribute('data-cart-input') || target.id === 'detail-qty-input')) {
      let val = target.value.replace(/\D/g, '');
      if (val === '') return;
      let n = parseInt(val, 10);
      if (n > 99) n = 99;
      if (n < 1) n = 1;
      target.value = String(n);

      const albumId = Number(target.getAttribute('data-qty-input') || target.getAttribute('data-cart-input') || target.getAttribute('data-detail-qty-input'));
      if (albumId && selected.has(albumId)) {
        selected.set(albumId, n);
        updateSelection();
        if (target.hasAttribute('data-cart-input')) {
          renderSelection();
        }
      }
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && (target.hasAttribute('data-qty-input') || target.hasAttribute('data-cart-input') || target.id === 'detail-qty-input')) {
      let n = parseInt(target.value, 10);
      if (isNaN(n) || n < 1) n = 1;
      if (n > 99) n = 99;
      target.value = String(n);

      const albumId = Number(target.getAttribute('data-qty-input') || target.getAttribute('data-cart-input') || target.getAttribute('data-detail-qty-input'));
      if (albumId && selected.has(albumId)) {
        selected.set(albumId, n);
        updateSelection();
        if (target.hasAttribute('data-cart-input')) {
          renderSelection();
        }
      }
    }
  });

  for (const id of ['search', 'artist', 'format', 'sort']) {
    $(id)?.addEventListener(id === 'search' ? 'input' : 'change', draw);
  }

  $('clear')?.addEventListener('click', clearFilters);
  $('top')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  for (const dialog of [$('detail'), $('selection')]) {
    dialog?.addEventListener('click', (event) => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) {
          dialog.close();
        }
      }
    });
  }

  // --- Dynamic Hydration from Cloudflare D1 (/api/catalog) ---
  async function hydrateFromD1() {
    try {
      const response = await fetch('/api/catalog', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload || !payload.success || !Array.isArray(payload.products)) return;

      const nextProducts = payload.products;
      const nextSettings = payload.settings ? { ...settings, ...payload.settings } : settings;

      const changed =
        JSON.stringify(nextProducts) !== JSON.stringify(catalog) ||
        JSON.stringify(nextSettings) !== JSON.stringify(settings);

      if (changed) {
        settings = nextSettings;
        catalog = nextProducts;
        for (const id of [...selected.keys()]) {
          if (!catalog.some((p) => Number(p.id) === Number(id))) {
            selected.delete(id);
          }
        }
        renderSettingsAndHero();
        renderFilterOptions();
        readUrlState();
        drawGenres();
        draw();
        if (openAlbumId && !$('detail')?.open) {
          showDetail(openAlbumId, true);
        }
      }
    } catch {
      // Static snapshot remains active offline or during local astro preview
    }
  }

  // --- Initial Boot ---
  renderFilterOptions();
  readUrlState();
  drawGenres();
  draw();
  if (openAlbumId) {
    showDetail(openAlbumId, true);
  }
  hydrateFromD1();
  initClientAuthState();

  // Se a URL tiver ?openCart=1, abre automaticamente o carrinho
  const bootParams = new URLSearchParams(window.location.search);
  if (bootParams.get('openCart') === '1' && selected.size > 0) {
    setTimeout(() => {
      renderSelection();
      const selDialog = $('selection');
      if (selDialog && !selDialog.open) {
        selDialog.showModal();
      }
      toast('Seu pedido está pronto! Clique em "Enviar Pedido" para finalizar.');
    }, 300);
  }
})();
