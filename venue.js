import { foldVietnamese, matchesMenuProduct, localVenueDateTime, validateBookingSlot, validGuestPhone, normalizeTableCode, makeTableLink } from './guest-utils.mjs';
const $ = selector => document.querySelector(selector);
const formatMoney = amount => new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
const cart = new Map();
const products = new Map();
let activeMenuCategory = 'Tất cả';
let cartRestored = false;
const cartStorageKey = 'cera-cart-v1';
function saveCart() {
  // Persist IDs and quantities only. Never store guest names, phone numbers or tracking tokens.
  try { sessionStorage.setItem(cartStorageKey, JSON.stringify([...cart])); } catch { /* storage may be disabled */ }
}
function restoreCart() {
  if (!cartRestored) {
    cartRestored = true;
    try {
      const raw = sessionStorage.getItem(cartStorageKey) || '[]';
      const entries = raw.length <= 12000 ? JSON.parse(raw) : [];
      if (Array.isArray(entries)) {
        for (const entry of entries.slice(0, 30)) {
          if (!Array.isArray(entry) || entry.length !== 2) continue;
          const [id, quantity] = entry;
          if (typeof id === 'string' && products.has(id) && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 20) cart.set(id, quantity);
        }
      }
    } catch { /* invalid private browsing storage */ }
  }
  for (const id of cart.keys()) if (!products.has(id)) cart.delete(id);
  renderCart();
}
function updateCartQuantity(id, quantity) {
  if (!products.has(id)) return;
  if (!Number.isSafeInteger(quantity) || quantity > 20) return;
  if (quantity > 0 && cart.size >= 30 && !cart.has(id)) {
    showMessage('order-message', 'Mỗi yêu cầu tối đa 30 món khác nhau.', true);
    return;
  }
  if (quantity <= 0) cart.delete(id);
  else cart.set(id, quantity);
  // A changed payload must not reuse an idempotency key from a previous order attempt.
  delete $('#order-form').dataset.key;
  renderCart();
}

const isStaticPages = document.documentElement.dataset.siteHost === 'github-pages';
const apiOrigin = String(globalThis.TanDesignConfig?.apiOrigin || '').replace(/\/+$/, '');
function backendUrl(path) {
  if (!isStaticPages) return path;
  if (!apiOrigin) throw new Error('Hệ thống nhận yêu cầu đang được kết nối. Vui lòng xem địa chỉ quán trên Google Maps.');
  return new URL(path, apiOrigin).href;
}
function setGuestFormsEnabled(enabled) {
  for (const id of ['order-form', 'booking-form', 'checkin-form']) {
    document.getElementById(id).querySelector('button[type=submit]').disabled = !enabled;
  }
}
function disableGuestForms() { setGuestFormsEnabled(false); }
function showGuestServiceState(state, message) {
  const banner = $('#guest-service-banner');
  banner.hidden = false;
  banner.dataset.state = state;
  $('#guest-service-message').textContent = message;
}
function initTableDeepLink() {
  const input = $('#table-name');
  const fromQR = normalizeTableCode(new URL(location.href).searchParams.get('table'));
  if (fromQR) {
    input.value = fromQR;
    $('#table-link-note').textContent = 'Đã điền bàn ' + fromQR + ' từ liên kết hoặc mã QR. Vui lòng đối chiếu số bàn thực tế với nhân viên. Liên kết không tự tạo hoặc xác nhận đơn.';
  }
  $('#copy-table-link').addEventListener('click', async () => {
    const feedback = $('#table-copy-state');
    const fallback = $('#table-share-url');
    fallback.hidden = true;
    try {
      const link = makeTableLink(location.href, input.value);
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      feedback.textContent = 'Đã sao chép liên kết bàn. Có thể dùng liên kết này để tạo mã QR.';
    } catch {
      try {
        const link = makeTableLink(location.href, input.value);
        fallback.value = link;
        fallback.hidden = false;
        fallback.focus();
        fallback.select();
        feedback.textContent = 'Không tự sao chép được. Hãy sao chép đường dẫn hiển thị bên dưới.';
      } catch (error) {
        feedback.textContent = error.message;
      }
    }
  });
}
initTableDeepLink();
let trackingTimer = null;
async function refreshTracking(data) {
  try {
    if (document.hidden) return;
    const result = await request('/api/public/status', { id: data.id, trackingToken: data.trackingToken });
    const item = result.request;
    const messages = {
      pending: 'Đang chờ nhân viên xác nhận. Đây chưa phải đơn hàng hoặc đặt chỗ đã được duyệt.',
      approved: item.kind === 'order' ? 'Đã duyệt yêu cầu, đang chuyển đến quầy pha chế.' : item.kind === 'reservation' ? 'Yêu cầu đặt bàn đã được nhân viên xác nhận.' : 'Check-in đã được nhân viên tiếp nhận.',
      preparing: 'Đồ uống / món đang được pha chế.',
      ready: 'Món đã sẵn sàng. Nhân viên đang chuẩn bị mang tới bàn.',
      served: 'Món đã được phục vụ. Cảm ơn bạn!',
      rejected: 'Yêu cầu không được chấp nhận. Vui lòng liên hệ nhân viên để được hỗ trợ.'
    };
    $('#tracking-state').textContent = messages[item.stage] || 'Đang cập nhật trạng thái yêu cầu.';
    if (item.stage === 'served' || item.stage === 'rejected' || (item.kind !== 'order' && item.status === 'approved')) {
      if (trackingTimer) clearInterval(trackingTimer);
      trackingTimer = null;
    }
  } catch {
    $('#tracking-state').textContent = 'Chưa thể cập nhật trạng thái. Bạn có thể liên hệ nhân viên và cung cấp mã yêu cầu.';
  }
}
function trackSubmission(result) {
  const data = result?.result;
  if (!data?.id || !data?.trackingToken) return;
  if (trackingTimer) clearInterval(trackingTimer);
  $('#tracking-panel').hidden = false;
  $('#tracking-code').textContent = data.code;
  $('#tracking-state').textContent = 'Đang chờ nhân viên xác nhận.';
  refreshTracking(data);
  trackingTimer = setInterval(() => refreshTracking(data), 12000);
}
function showMessage(id, value, error = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.className = 'form-message ' + (error ? 'error' : 'ok');
}
async function request(path, data) {
  const response = await fetch(backendUrl(path), { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), cache: 'no-store', credentials: 'omit' });
  const body = await response.json().catch(() => ({ error: 'Dữ liệu trả về không hợp lệ.' }));
  if (!response.ok) throw new Error(body.error || 'Không gửi được yêu cầu.');
  return body;
}
function renderCart() {
  const el = $('#cart-lines');
  el.replaceChildren();
  const count = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
  const countLabel = $('#cart-count');
  countLabel.textContent = String(count);
  countLabel.hidden = count === 0;
  if (!cart.size) {
    el.textContent = 'Chưa có món được chọn.';
    saveCart();
    return;
  }
  let total = 0;
  for (const [id, quantity] of cart) {
    const product = products.get(id);
    if (!product) continue;
    total += product.price * quantity;
    const row = document.createElement('div');
    row.className = 'cart-line cart-edit-line';
    const name = document.createElement('span');
    name.className = 'cart-product-name';
    name.textContent = product.name;
    const controls = document.createElement('div');
    controls.className = 'cart-quantity';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    minus.setAttribute('aria-label', 'Giảm số lượng ' + product.name);
    minus.addEventListener('click', () => updateCartQuantity(id, quantity - 1));
    const number = document.createElement('span');
    number.textContent = String(quantity);
    number.setAttribute('aria-label', 'Số lượng ' + product.name);
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+';
    plus.disabled = quantity >= 20;
    plus.setAttribute('aria-label', 'Tăng số lượng ' + product.name);
    plus.addEventListener('click', () => updateCartQuantity(id, quantity + 1));
    controls.append(minus, number, plus);
    const price = document.createElement('strong');
    price.textContent = formatMoney(product.price * quantity);
    row.append(name, controls, price);
    el.append(row);
  }
  const totalRow = document.createElement('div');
  totalRow.className = 'cart-line cart-total';
  totalRow.textContent = 'Tạm tính (chưa phí/thuế): ' + formatMoney(total);
  el.append(totalRow);
  const clear = document.createElement('button');
  clear.type = 'button'; clear.textContent = 'Xóa giỏ hàng';
  clear.className = 'cart-clear';
  clear.addEventListener('click', () => {
    cart.clear(); delete $('#order-form').dataset.key; renderCart();
  });
  el.append(clear);
  saveCart();
}
function renderProducts(list) {
  const grid = $('#menu-grid');
  grid.replaceChildren();
  products.clear();
  if (!list.length) {
    $('#menu-state').textContent = 'Thực đơn đang được cập nhật. Liên hệ nhân viên để được tư vấn.';
    return;
  }
  $('#menu-state').hidden = true;
  for (const product of list) {
    products.set(product.id, product);
    const card = document.createElement('article'); card.className = 'menu-item';
    card.dataset.category = String(product.category || 'Khác');
    card.dataset.productId = String(product.id);
    const category = document.createElement('small'); category.textContent = product.category;
    const title = document.createElement('h3'); title.textContent = product.name;
    const unit = document.createElement('p'); unit.textContent = product.unit || 'Phần';
    const footer = document.createElement('footer');
    const price = document.createElement('b'); price.textContent = formatMoney(product.price);
    const add = document.createElement('button'); add.type = 'button'; add.textContent = '+';
    add.setAttribute('aria-label', 'Thêm ' + product.name + ' vào giỏ');
    add.addEventListener('click', () => updateCartQuantity(product.id, Math.min((cart.get(product.id) || 0) + 1, 20)));
    footer.append(price, add); card.append(category, title, unit, footer); grid.append(card);
  }
  restoreCart();
}
function applyMenuFilters() {
  const query = $('#menu-search').value;
  let visible = 0;
  $('#menu-grid').querySelectorAll('.menu-item').forEach(card => {
    const product = products.get(card.dataset.productId);
    const show = !!product && matchesMenuProduct(product, { category: activeMenuCategory, query });
    card.hidden = !show;
    if (show) visible++;
  });
  const feedback = $('#menu-match-count');
  feedback.textContent = visible
    ? 'Hiển thị ' + visible + ' / ' + products.size + ' món'
    : 'Không tìm thấy món phù hợp. Hãy thử từ khóa hoặc nhóm món khác.';
}
$('#menu-search').addEventListener('input', applyMenuFilters);
function renderMenuFilters(list) {
  const holder = $('#menu-filters');
  holder.replaceChildren();
  const categories = ['Tất cả', ...new Set(list.map(item => String(item.category || 'Khác')))];
  if (!categories.includes(activeMenuCategory)) activeMenuCategory = 'Tất cả';
  holder.hidden = list.length === 0;
  $('#menu-search').disabled = !list.length;
  if (!list.length) return;
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-chip';
    button.textContent = category;
    button.setAttribute('aria-pressed', String(category === activeMenuCategory));
    button.addEventListener('click', () => {
      activeMenuCategory = category;
      holder.querySelectorAll('button').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
      applyMenuFilters();
    });
    holder.append(button);
  }
  applyMenuFilters();
}
function renderEvents(events) {
  if (!events?.length) return;
  const grid = $('#event-grid'); grid.replaceChildren();
  for (const event of events) {
    const card = document.createElement('article'); card.className = 'event-card';
    const type = document.createElement('span'); type.className = 'event-index'; type.textContent = 'CERA · EVENT';
    const symbol = document.createElement('span'); symbol.className = 'event-symbol'; symbol.textContent = '✦';
    const title = document.createElement('h3'); title.textContent = event.title;
    const info = document.createElement('p'); info.textContent = event.description || '';
    const date = document.createElement('span'); date.className = 'event-status';
    date.textContent = new Date(event.startsAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    card.append(type, symbol, title, info, date); grid.append(card);
  }
}
$('#menu-toggle').addEventListener('click', () => {
  const nav = $('#site-nav'); const open = nav.classList.toggle('open');
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('#site-nav a').forEach(link => link.addEventListener('click', () => {
  $('#site-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded', 'false');
}));
$('#order-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!cart.size) { showMessage('order-message', 'Vui lòng chọn ít nhất một món.', true); return; }
  if (cart.size > 30) { showMessage('order-message', 'Tối đa 30 món khác nhau cho một yêu cầu.', true); return; }
  const form = event.currentTarget, button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const tableName = form.elements.namedItem('tableName').value.trim();
    const items = [...cart].map(([productId, quantity]) => ({ productId, quantity }));
    const result = await request('/api/public/request', { kind: 'order', tableName, items, note: $('#order-note').value, idempotencyKey: form.dataset.key || (form.dataset.key = crypto.randomUUID()) });
    cart.clear(); renderCart(); delete form.dataset.key; trackSubmission(result);
    showMessage('order-message', 'Đã gửi yêu cầu ' + result.result.code + '. Nhân viên sẽ duyệt trước khi pha chế.');
  } catch (error) { showMessage('order-message', error.message, true); }
  finally { button.disabled = false; }
});
$('#booking-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const data = new FormData(form);
    const dt = String(data.get('startAt'));
    const timeIso = validateBookingSlot(dt);
    const phone = String(data.get('phone')).trim();
    if (!validGuestPhone(phone)) throw new Error('Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.');
    const result = await request('/api/public/request', { kind: 'reservation', customerName: String(data.get('customerName')), phone, startAt: timeIso, guests: Number(data.get('guests')), note: String(data.get('note')), idempotencyKey: form.dataset.key || (form.dataset.key = crypto.randomUUID()) });
    showMessage('booking-message', 'Đã tiếp nhận yêu cầu ' + result.result.code + '. Vui lòng chờ nhân viên liên hệ xác nhận.');
    form.reset(); delete form.dataset.key; trackSubmission(result);
  } catch (error) { showMessage('booking-message', error.message, true); }
  finally { btn.disabled = false; }
});
$('#checkin-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, btn = form.querySelector('button'); btn.disabled = true;
  try {
    const data = new FormData(form);
    const phone = String(data.get('phone')).trim();
    if (!validGuestPhone(phone)) throw new Error('Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.');
    const result = await request('/api/public/request', { kind: 'checkin', name: String(data.get('name')), phone, note: String(data.get('note')), idempotencyKey: form.dataset.key || (form.dataset.key = crypto.randomUUID()) });
    showMessage('checkin-message', 'Đã ghi nhận check-in ' + result.result.code + '. Nhân viên sẽ đón tiếp bạn.');
    form.reset(); delete form.dataset.key; trackSubmission(result);
  } catch (error) { showMessage('checkin-message', error.message, true); }
  finally { btn.disabled = false; }
});
function setBookingTimeLimits() {
  const input = $('#booking-form').elements.namedItem('startAt');
  input.min = localVenueDateTime(Date.now() + 15 * 60000);
  input.max = localVenueDateTime(Date.now() + 90 * 86400000);
}
setBookingTimeLimits();
$('#booking-form').elements.namedItem('startAt').addEventListener('focus', setBookingTimeLimits);
async function initialize() {
  if (isStaticPages) {
    const staffLink = document.getElementById('staff-entry');
    if (staffLink) {
      if (apiOrigin) staffLink.href = new URL('/pos', apiOrigin).href;
      else staffLink.hidden = true;
    }
    if (!apiOrigin) {
      $('#menu-state').textContent = 'Website giới thiệu đã sẵn sàng. Thực đơn, check-in và gọi món đang chờ kết nối máy chủ của quán. Xem địa chỉ Cera Bar & Lounge tại Swanlake Ecopark trên Google Maps.';
      disableGuestForms();
      showGuestServiceState('not-configured', 'Website đang ở chế độ giới thiệu. Gọi món, đặt bàn và check-in trực tuyến chưa kết nối với hệ thống quán.');
      return;
    }
  }
  if (!navigator.onLine) {
    showGuestServiceState('offline', 'Thiết bị đang mất kết nối Internet. Không thể gửi yêu cầu đến nhân viên.');
    disableGuestForms();
    return;
  }
  try {
    const result = await request('/api/public/menu');
    renderProducts(result.products || []);
    renderMenuFilters(result.products || []);
    renderEvents(result.events || []);
    if (result.setupRequired) {
      const notice = $('#menu-state');
      notice.hidden = false;
      notice.textContent = 'Hệ thống đang được quán thiết lập. Vui lòng đến quán hoặc kiểm tra bản đồ Cera Bar & Lounge để được hỗ trợ.';
      disableGuestForms();
      showGuestServiceState('setup', 'Máy chủ của quán chưa hoàn tất thiết lập. Vui lòng liên hệ trực tiếp để được hỗ trợ.');
    } else {
      setGuestFormsEnabled(true);
      showGuestServiceState('ready', 'Đã kết nối hệ thống quán. Các yêu cầu gửi từ website vẫn cần nhân viên duyệt.');
    }
  } catch {
    $('#menu-state').textContent = 'Chưa thể kết nối máy chủ thực đơn. Vui lòng thử lại sau hoặc kiểm tra địa chỉ quán trên Google Maps.';
    disableGuestForms();
    showGuestServiceState('unavailable', 'Hệ thống nhận yêu cầu đang tạm gián đoạn. Website chưa thể xác nhận check-in, đặt bàn hoặc gọi món.');
  }
}
window.addEventListener('offline', () => {
  disableGuestForms();
  showGuestServiceState('offline', 'Thiết bị đang mất kết nối Internet. Không thể gửi yêu cầu đến nhân viên.');
});
window.addEventListener('online', initialize);
initialize();

function initScrollReveal() {
  if (!('IntersectionObserver' in window) ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const elements = [...document.querySelectorAll('[data-reveal]')];
  if (!elements.length) return;
  const observer = new IntersectionObserver((entries, watcher) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        watcher.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });
  document.documentElement.classList.add('scroll-reveal-ready');
  elements.forEach((el, index) => {
    el.style.setProperty('--reveal-delay', String((index % 3) * 75) + 'ms');
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.88) el.classList.add('is-visible');
    else observer.observe(el);
  });
}
initScrollReveal();


function initGalleryLightbox() {
  const dialog = document.getElementById('gallery-lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const images = [...document.querySelectorAll('.bar-gallery .gallery-tile img')];
  const zoomButtons = [...document.querySelectorAll('.gallery-zoom')];
  if (!images.length) return;
  let current = 0;
  let opener = null;
  const display = next => {
    current = (next + images.length) % images.length;
    const image = images[current];
    document.getElementById('lightbox-image').src = image.currentSrc || image.src;
    document.getElementById('lightbox-image').alt = image.alt;
    document.getElementById('lightbox-title').textContent = image.closest('figure')?.querySelector('figcaption strong')?.textContent || 'Ảnh không gian thực tế Cera Bar & Lounge';
    document.getElementById('lightbox-caption').textContent = 'Ảnh chụp thực tế · Cera Bar & Lounge';
    document.getElementById('lightbox-counter').textContent = (current + 1) + ' / ' + images.length;
  };
  zoomButtons.forEach((button, index) => button.addEventListener('click', () => {
    opener = button;
    display(index);
    dialog.showModal();
    document.body.classList.add('lightbox-open');
    document.getElementById('lightbox-close').focus();
  }));
  document.getElementById('lightbox-close').addEventListener('click', () => dialog.close());
  document.getElementById('lightbox-prev').addEventListener('click', () => display(current - 1));
  document.getElementById('lightbox-next').addEventListener('click', () => display(current + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      display(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('lightbox-open');
    document.getElementById('lightbox-image').removeAttribute('src');
    opener?.focus();
    opener = null;
  });
}
function initPageNavigation() {
  const progress = document.getElementById('scroll-progress');
  const topButton = document.getElementById('back-to-top');
  if (!progress || !topButton) return;
  let pending = false;
  const update = () => {
    const remaining = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = remaining > 0 ? Math.min(1, Math.max(0, window.scrollY / remaining)) : 0;
    progress.style.transform = 'scaleX(' + ratio + ')';
    topButton.hidden = window.scrollY < 650;
    pending = false;
  };
  window.addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  topButton.addEventListener('click', () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
  });
  update();
}
initGalleryLightbox();
initPageNavigation();


/**
 * Optional progressive web app for the public GitHub Pages site only.
 * No caching of API/guest request endpoints, POST bodies, customer PII, or tracking tokens.
 * When offline, the existing guest status banner disables all request buttons.
 */
function initGuestPwa() {
  if (!isStaticPages || !window.isSecureContext) return;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(new URL('./guest-sw.js', import.meta.url), { scope: './' })
        .catch(() => { /* unsupported environments keep working as a website */ });
    });
  }
  const installButton = $('#install-guest-app');
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!deferredInstall) return;
    const promptEvent = deferredInstall;
    deferredInstall = null;
    installButton.hidden = true;
    try { await promptEvent.prompt(); } catch { /* user may dismiss */ }
  });
  window.addEventListener('appinstalled', () => { deferredInstall = null; installButton.hidden = true; });
}
initGuestPwa();
