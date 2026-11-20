/** Browser-safe, dependency-free helpers for Tân Design guest menu and reservations. */
export function foldVietnamese(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
}
export function matchesMenuProduct(product, { category = 'Tất cả', query = '' } = {}) {
  if (category !== 'Tất cả' && String(product.category || 'Khác') !== category) return false;
  const search = foldVietnamese(query);
  return !search || foldVietnamese([product.name, product.category, product.unit].join(' ')).includes(search);
}
export function localVenueDateTime(timestamp = Date.now()) {
  const epoch = Number(timestamp);
  if (!Number.isFinite(epoch)) throw new Error('Thời gian không hợp lệ.');
  return new Date(epoch + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
export function validateBookingSlot(value, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Vui lòng chọn ngày và giờ hợp lệ.');
  // datetime-local is defined in the bar's time zone (UTC+7), not the customer's device time zone.
  const time = new Date(value + ':00+07:00');
  if (!Number.isFinite(time.getTime()) || localVenueDateTime(time.getTime()) !== value) {
    throw new Error('Ngày hoặc giờ đặt bàn không hợp lệ.');
  }
  const timeMs = time.getTime();
  if (timeMs <= Number(now)) throw new Error('Vui lòng chọn thời gian trong tương lai.');
  if (timeMs > Number(now) + 90 * 86400000) throw new Error('Chỉ nhận yêu cầu đặt bàn trong 90 ngày tới.');
  const hhmm = value.slice(11);
  if (hhmm < '16:00' || hhmm > '23:00') throw new Error('Quán nhận khách từ 16:00 đến 23:00 (giờ Việt Nam).');
  return time.toISOString();
}
export function validGuestPhone(value) {
  const phone = String(value ?? '').trim();
  if (!/^[+\d][\d\s().-]{5,28}$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function normalizeTableCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.normalize('NFC').trim();
  if (code.length === 0 || code.length > 50 || !/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(code)) return null;
  return code;
}
export function makeTableLink(siteHref, rawCode) {
  const table = normalizeTableCode(rawCode);
  if (!table) throw new Error('Số bàn không hợp lệ. Vui lòng nhập lại theo hướng dẫn nhân viên.');
  const url = new URL(siteHref);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Đường dẫn website không hợp lệ.');
  // Do not propagate tracking parameters or unknown tokens into printed/shared table QR links.
  url.search = '';
  url.searchParams.set('table', table);
  url.hash = 'order-card';
  return url.href;
}
