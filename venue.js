const $ = selector => document.querySelector(selector);
const formatMoney = amount => new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
const cart = new Map();
const products = new Map();
const isStaticPages = document.documentElement.dataset.siteHost === 'github-pages';
const apiOrigin = String(globalThis.TanDesignConfig?.apiOrigin || '').replace(/\/+$/, '');
function backendUrl(path) {
  if (!isStaticPages) return path;
  if (!apiOrigin) throw new Error('Hệ thống nhận yêu cầu đang được kết nối. Vui lòng liên hệ Zalo 0867899987.');
  return new URL(path, apiOrigin).href;
}
function disableGuestForms() {
  for (const id of ['order-form', 'booking-form', 'checkin-form']) {
    document.getElementById(id).querySelector('button[type=submit]').disabled = true;
  }
}
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
  if (!cart.size) { el.textContent = 'Chưa có món được chọn.'; return; }
  let total = 0;
  for (const [id, quantity] of cart) {
    const product = products.get(id);
    if (!product) continue;
    total += product.price * quantity;
    const row = document.createElement('div');
    row.className = 'cart-line';
    const name = document.createElement('span');
    name.textContent = product.name + ' × ' + quantity;
    const price = document.createElement('strong');
    price.textContent = formatMoney(product.price * quantity);
    row.append(name, price);
    el.append(row);
  }
  const totalRow = document.createElement('div');
  totalRow.className = 'cart-line';
  totalRow.textContent = 'Tạm tính (chưa phí/thuế): ' + formatMoney(total);
  el.append(totalRow);
  const clear = document.createElement('button');
  clear.type = 'button'; clear.textContent = 'Xóa giỏ hàng';
  clear.style.cssText = 'background:transparent;color:#f39bab;border:0;padding:8px 0;text-decoration:underline';
  clear.addEventListener('click', () => { cart.clear(); renderCart(); });
  el.append(clear);
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
    const category = document.createElement('small'); category.textContent = product.category;
    const title = document.createElement('h3'); title.textContent = product.name;
    const unit = document.createElement('p'); unit.textContent = product.unit || 'Phần';
    const footer = document.createElement('footer');
    const price = document.createElement('b'); price.textContent = formatMoney(product.price);
    const add = document.createElement('button'); add.type = 'button'; add.textContent = '+';
    add.setAttribute('aria-label', 'Thêm ' + product.name + ' vào giỏ');
    add.addEventListener('click', () => { cart.set(product.id, Math.min((cart.get(product.id) || 0) + 1, 20)); renderCart(); });
    footer.append(price, add); card.append(category, title, unit, footer); grid.append(card);
  }
}
function renderMenuFilters(list) {
  const holder = $('#menu-filters');
  holder.replaceChildren();
  const categories = ['Tất cả', ...new Set(list.map(item => String(item.category || 'Khác')))];
  holder.hidden = list.length === 0;
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-chip';
    button.textContent = category;
    button.setAttribute('aria-pressed', String(category === 'Tất cả'));
    button.addEventListener('click', () => {
      holder.querySelectorAll('button').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
      $('#menu-grid').querySelectorAll('.menu-item').forEach(card => {
        card.hidden = category !== 'Tất cả' && card.dataset.category !== category;
      });
    });
    holder.append(button);
  }
}
function renderEvents(events) {
  if (!events?.length) return;
  const grid = $('#event-grid'); grid.replaceChildren();
  for (const event of events) {
    const card = document.createElement('article'); card.className = 'event-card';
    const type = document.createElement('span'); type.className = 'event-index'; type.textContent = 'TÂN DESIGN · EVENT';
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
    const timestamp = new Date(dt + ':00+07:00');
    if (!Number.isFinite(timestamp.getTime())) throw new Error('Ngày giờ không hợp lệ.');
    const result = await request('/api/public/request', { kind: 'reservation', customerName: String(data.get('customerName')), phone: String(data.get('phone')), startAt: timestamp.toISOString(), guests: Number(data.get('guests')), note: String(data.get('note')), idempotencyKey: form.dataset.key || (form.dataset.key = crypto.randomUUID()) });
    showMessage('booking-message', 'Đã tiếp nhận yêu cầu ' + result.result.code + '. Vui lòng chờ nhân viên liên hệ xác nhận.');
    form.reset(); delete form.dataset.key; trackSubmission(result);
  } catch (error) { showMessage('booking-message', error.message, true); }
  finally { btn.disabled = false; }
});
$('#checkin-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, btn = form.querySelector('button'); btn.disabled = true;
  try {
    const data = new FormData(form);
    const result = await request('/api/public/request', { kind: 'checkin', name: String(data.get('name')), phone: String(data.get('phone')), note: String(data.get('note')), idempotencyKey: form.dataset.key || (form.dataset.key = crypto.randomUUID()) });
    showMessage('checkin-message', 'Đã ghi nhận check-in ' + result.result.code + '. Nhân viên sẽ đón tiếp bạn.');
    form.reset(); delete form.dataset.key; trackSubmission(result);
  } catch (error) { showMessage('checkin-message', error.message, true); }
  finally { btn.disabled = false; }
});
async function initialize() {
  if (isStaticPages) {
    const staffLink = document.getElementById('staff-entry');
    if (staffLink) {
      if (apiOrigin) staffLink.href = new URL('/pos', apiOrigin).href;
      else staffLink.hidden = true;
    }
    if (!apiOrigin) {
      $('#menu-state').textContent = 'Website giới thiệu đã sẵn sàng. Thực đơn, check-in và gọi món đang chờ kết nối máy chủ của quán. Liên hệ Zalo 0867899987 để được hỗ trợ.';
      disableGuestForms();
      return;
    }
  }
  try {
    const result = await request('/api/public/menu');
    renderProducts(result.products || []);
    renderMenuFilters(result.products || []);
    renderEvents(result.events || []);
    if (result.setupRequired) {
      const notice = $('#menu-state');
      notice.hidden = false;
      notice.textContent = 'Hệ thống đang được quán thiết lập. Vui lòng liên hệ Zalo 0867899987 để đặt bàn hoặc gọi món.';
      disableGuestForms();
    }
  } catch { $('#menu-state').textContent = 'Chưa thể kết nối máy chủ thực đơn. Vui lòng thử lại sau hoặc liên hệ Zalo 0867899987.'; disableGuestForms(); }
}
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
