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
  let selected = new Set(
    (storage.get('rstk-selection', []) || []).filter((id) =>
      catalog.some((album) => Number(album.id) === Number(id))
    )
  );
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
      resultEl.textContent = `${arr.length} de ${catalog.length} títulos${
        savedOnly ? ' · Minha seleção' : ''
      }`;
    }

    const gridEl = $('grid');
    if (gridEl) {
      gridEl.innerHTML = arr.length
        ? arr
            .map((p) => {
              const id = Number(p.id);
              const isSelected = selected.has(id);
              const unitsLabel = `${p.units} ${Number(p.units) === 1 ? 'LP' : 'LPs'}`;
              const isSoldOut = !p.active || (typeof p.stock === 'number' && p.stock <= 0);
              return `<article class="card ${isSoldOut ? 'sold-out' : ''}" data-id="${id}">
                <div class="art">
                  <button class="art-open" type="button" data-detail="${id}" aria-label="Ver detalhes de ${escapeHTML(p.title)}">
                    <img src="${escapeHTML(sanitizeHref(p.cover))}" loading="lazy" decoding="async" width="600" height="600" alt="Capa de ${escapeHTML(p.title)}, ${escapeHTML(p.artist)}">
                  </button>
                  <span class="lp">${escapeHTML(unitsLabel)}</span>
                  ${isSoldOut ? '<span class="ribbon-sold-out" aria-label="Esgotado">ESGOTADO</span>' : ''}
                  <button class="heart ${isSelected ? 'on' : ''}" type="button" data-save="${id}" aria-pressed="${isSelected}" aria-label="${isSelected ? 'Remover' : 'Adicionar'} ${escapeHTML(p.title)} ${isSelected ? 'da' : 'à'} seleção">${isSelected ? '♥' : '♡'}</button>
                </div>
                <div class="card-info">
                  <p class="artist">${escapeHTML(p.artist)}</p>
                  <button class="title" type="button" data-detail="${id}">${escapeHTML(p.title)}</button>
                  <p class="genre">${escapeHTML(p.genre)}</p>
                  <button class="detail-btn" type="button" data-detail="${id}">Conheça o disco <span>↗</span></button>
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
      .map((p) => `• ${p.artist} — ${p.title} (${p.units} ${Number(p.units) === 1 ? 'LP' : 'LPs'})`)
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
    const savedCountEl = $('saved-count');
    const barCountEl = $('bar-count');
    const selectionBarEl = $('selectionbar');
    if (savedCountEl) savedCountEl.textContent = String(selected.size);
    if (barCountEl) barCountEl.textContent = String(selected.size);
    if (selectionBarEl) selectionBarEl.hidden = selected.size === 0;

    storage.set('rstk-selection', [...selected]);

    for (const id of ['copy', 'download', 'empty-selection']) {
      const btn = $(id);
      if (btn) btn.disabled = selected.size === 0;
    }
  }

  function toggleSave(id) {
    const numericId = Number(id);
    if (selected.has(numericId)) selected.delete(numericId);
    else selected.add(numericId);

    draw();
    if ($('detail')?.open) showDetail(numericId, false);
    if ($('selection')?.open) renderSelection();
  }

  function showDetail(id, open = true) {
    const numericId = Number(id);
    const album = catalog.find((p) => Number(p.id) === numericId);
    if (!album) return;

    openAlbumId = numericId;
    const isSaved = selected.has(numericId);
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
            <div><dt>Formato na lista</dt><dd>${album.units} ${Number(album.units) === 1 ? 'LP' : 'LPs'}</dd></div>
            <div><dt>Data da edição na lista</dt><dd>${dateBR(album.date)}</dd></div>
            <div><dt>Preço de lançamento</dt><dd>${escapeHTML(priceDisplay)}</dd></div>
            <div><dt>Disponibilidade</dt><dd style="${isSoldOut ? 'color:#DC2626;font-weight:700;' : ''}">${
              isSoldOut ? '🔴 ESGOTADO' : (typeof album.stock === 'number' ? `${album.stock} un. em estoque` : '30 un.')
            }</dd></div>
          </dl>
          <div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.75rem;">
            <button class="primary" type="button" data-save="${numericId}">${
              isSaved ? '♥ Na sua seleção · remover' : '♡ Adicionar à seleção'
            }</button>
            ${
              isSoldOut
                ? `<button class="whatsapp-action" type="button" data-buy-now="${numericId}" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;background:#DC2626;color:#FFF;font-weight:700;padding:0.75rem 1rem;border-radius:999px;border:none;cursor:pointer;width:100%;text-decoration:none;">
                    Consultar fila de espera via WhatsApp ↗
                  </button>`
                : `<button class="whatsapp-action" type="button" data-buy-now="${numericId}" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;background:#25D366;color:#000;font-weight:700;padding:0.75rem 1rem;border-radius:999px;border:none;cursor:pointer;width:100%;text-decoration:none;">
                    Comprar este vinil via WhatsApp ↗
                  </button>`
            }
          </div>
          <p class="note">${escapeHTML(noteText)}</p>
          ${
            sourceHref !== '#'
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
      listEl.innerHTML = items.length
        ? items
            .map(
              (p) => `<li>
                <img src="${escapeHTML(sanitizeHref(p.cover))}" alt="">
                <div>
                  <strong>${escapeHTML(p.title)}</strong>
                  <small>${escapeHTML(p.artist)} · ${p.units} ${Number(p.units) === 1 ? 'LP' : 'LPs'}</small>
                </div>
                <button type="button" data-save="${Number(p.id)}" aria-label="Remover ${escapeHTML(p.title)}">×</button>
              </li>`
            )
            .join('')
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
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2800);
  }

  async function dispatchWhatsAppOrder(event, sourceEl, singleAlbumId = null) {
    if (event) event.preventDefault();

    let items = [];
    if (singleAlbumId) {
      const p = catalog.find((x) => Number(x.id) === Number(singleAlbumId));
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
    } else if (selected.size > 0) {
      const selectedItems = catalog.filter((p) => selected.has(Number(p.id)));
      items = selectedItems.map((p) => ({
        id: Number(p.id),
        title: p.title,
        artist: p.artist,
        units: Number(p.units) || 1,
        priceCents: p.priceCents ?? settings.priceCents ?? 18999,
        quantity: 1,
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
            ? `Pedido de ${items.length} vinil(is) solicitado via WhatsApp`
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
      message = `Olá, RSTK! Gostaria de encomendar no atacado o vinil lacrado:\n\n• ${items[0].artist} — ${items[0].title} (${items[0].units} ${Number(items[0].units) === 1 ? 'LP' : 'LPs'})\n\nPodem confirmar o envio e as condições de pagamento?`;
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
  }

  // --- Event Listeners ---
  $('copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(selectionText());
      toast('Lista copiada!');
    } catch {
      const fallback = $('copy-fallback');
      if (fallback) {
        fallback.value = selectionText();
        fallback.hidden = false;
        fallback.select();
      }
      toast('Selecione e copie a lista abaixo.');
    }
  });

  $('download')?.addEventListener('click', () => {
    const blob = new Blob([selectionText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Minha_Selecao_RSTK.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

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

  $('whatsapp-modal')?.addEventListener('click', (e) => dispatchWhatsAppOrder(e, $('whatsapp-modal')));
  $('whatsapp-floating')?.addEventListener('click', (e) => dispatchWhatsAppOrder(e, $('whatsapp-floating')));

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-detail],[data-save],[data-genre],[data-close],[data-clear],[data-buy-now]')
      : null;
    if (!target) return;

    if (target.hasAttribute('data-buy-now')) {
      dispatchWhatsAppOrder(event, target, Number(target.getAttribute('data-buy-now')));
    } else if (target.hasAttribute('data-detail')) {
      showDetail(Number(target.getAttribute('data-detail')));
    } else if (target.hasAttribute('data-save')) {
      toggleSave(Number(target.getAttribute('data-save')));
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
        selected = new Set(
          [...selected].filter((id) => catalog.some((p) => Number(p.id) === Number(id)))
        );
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
})();
