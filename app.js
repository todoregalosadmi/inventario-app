// ── CONFIG — reemplazá con tus credenciales de Supabase ──
const SUPABASE_URL = 'https://wcjyycgokxjlqznkaquf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5DB4QScSv_f-3E4zq5Pxdg_2HuPahNv';

// ── Init ──
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let pendingPhotoFile = null;

// ══════════════════════════════════
// AUTH
// ══════════════════════════════════
async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    showApp();
  } else {
    showAuth();
  }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) return showAuthError('Completá email y contraseña.');
  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) return showAuthError('Email o contraseña incorrectos.');
  const { data: { session } } = await db.auth.getSession();
  currentUser = session.user;
  showApp();
}

async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  if (!name || !email || !pass) return showAuthError('Completá todos los campos.');
  if (pass.length < 6) return showAuthError('La contraseña debe tener al menos 6 caracteres.');
  const { error } = await db.auth.signUp({ email, password: pass, options: { data: { name } } });
  if (error) return showAuthError(error.message);
  showAuthError('¡Cuenta creada! Revisá tu email para confirmar.', true);
}

async function doLogout() {
  await db.auth.signOut();
  currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  showLogin();
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const name = currentUser.user_metadata?.name || currentUser.email;
  document.getElementById('nav-user').textContent = name;
  loadAll();
}

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showLogin() {
  document.getElementById('form-login').classList.remove('hidden');
  document.getElementById('form-register').classList.add('hidden');
  clearAuthError();
}

function showRegister() {
  document.getElementById('form-login').classList.add('hidden');
  document.getElementById('form-register').classList.remove('hidden');
  clearAuthError();
}

function showAuthError(msg, isInfo = false) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  if (isInfo) el.style.background = 'rgba(59,130,246,0.1)';
}

function clearAuthError() {
  const el = document.getElementById('auth-error');
  el.classList.add('hidden');
  el.style.background = '';
}

// ══════════════════════════════════
// LOAD DATA
// ══════════════════════════════════
async function loadAll() {
  renderAll();
}

// ══════════════════════════════════
// PRODUCTS
// ══════════════════════════════════
async function fetchProducts() {
  const { data, error } = await db.from('products').select('*').order('nombre', { ascending: true });
  if (error) { showToast('Error cargando productos', 'error'); return []; }
  return data;
}

async function renderAll() {
  const [products, movements] = await Promise.all([fetchProducts(), fetchMovements()]);
  renderMetrics(products);
  renderCatFilter(products);
  renderProducts(products);
  renderAlerts(products);
  renderMovements(movements, products);
}

function renderMetrics(products) {
  const total = products.length;
  const valor = products.reduce((a, p) => a + p.stock * (p.precio || 0), 0);
  const low   = products.filter(p => p.stock > 0 && p.stock <= p.stock_minimo).length;
  const out   = products.filter(p => p.stock === 0).length;
  document.getElementById('m-total').textContent = total;
  document.getElementById('m-valor').textContent = '$' + valor.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  document.getElementById('m-low').textContent = low;
  document.getElementById('m-out').textContent = out;

  const badge = document.getElementById('alert-badge');
  const count = low + out;
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

function getStatus(p) {
  if (p.stock === 0) return 'out';
  if (p.stock_minimo > 0 && p.stock <= p.stock_minimo) return 'low';
  return 'ok';
}

function statusBadge(p) {
  const s = getStatus(p);
  if (s === 'out') return '<span class="badge badge-out">Sin stock</span>';
  if (s === 'low') return '<span class="badge badge-low">Stock bajo</span>';
  return '<span class="badge badge-ok">Normal</span>';
}

function renderCatFilter(products) {
  const sel = document.getElementById('filterCat');
  const current = sel.value;
  const cats = [...new Set(products.map(p => p.categoria).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`).join('');
}

function renderProducts(products) {
  const q   = document.getElementById('search').value.toLowerCase();
  const cat = document.getElementById('filterCat').value;
  const filtered = products.filter(p =>
    (!q || p.nombre.toLowerCase().includes(q) || (p.proveedor || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)) &&
    (!cat || p.categoria === cat)
  );
  const tbody = document.getElementById('tbody-products');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">🔍</span>Sin resultados</div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(p => {
    const thumb = p.foto_url
      ? `<img src="${p.foto_url}" class="prod-thumb" alt="${p.nombre}" />`
      : `<div class="prod-placeholder">📦</div>`;
    return `<tr>
      <td>${thumb}</td>
      <td>
        <div class="prod-name">${p.nombre}</div>
        ${p.proveedor ? `<div class="prod-prov">${p.proveedor}</div>` : ''}
        ${p.sku ? `<div class="prod-sku">${p.sku}</div>` : ''}
      </td>
      <td>${p.categoria || '—'}</td>
      <td>${p.stock} ${p.unidad || ''}</td>
      <td>${p.stock_minimo || 0}</td>
      <td>$${(p.precio || 0).toFixed(2)}</td>
      <td>${statusBadge(p)}</td>
      <td>
        <div class="actions">
          <button class="btn-icon" onclick="openMovModal('${p.id}', '${escapeHtml(p.nombre)}')" title="Registrar movimiento">±</button>
          <button class="btn-icon" onclick="openEditModal('${p.id}')" title="Editar">✎</button>
          <button class="btn-icon danger" onclick="deleteProduct('${p.id}', '${escapeHtml(p.nombre)}')" title="Eliminar">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderAlerts(products) {
  const el = document.getElementById('alerts-list');
  const alerts = products.filter(p => getStatus(p) !== 'ok');
  if (!alerts.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">✓</span>Sin alertas activas. ¡Todo el stock está en orden!</div>`;
    return;
  }
  el.innerHTML = alerts.map(p => {
    const s = getStatus(p);
    const msg = s === 'out' ? 'Sin stock — requiere reposición urgente' : `Stock bajo: ${p.stock} ${p.unidad || ''} (mínimo: ${p.stock_minimo})`;
    return `<div class="alert-item ${s}">
      <div>
        <div class="alert-name">${p.nombre}</div>
        <div class="alert-sub">${msg}</div>
      </div>
      <button class="btn-outline" onclick="openMovModal('${p.id}', '${escapeHtml(p.nombre)}')">Reponer →</button>
    </div>`;
  }).join('');
}

// ══════════════════════════════════
// PRODUCT MODAL
// ══════════════════════════════════
function openProductModal() {
  document.getElementById('edit-id').value = '';
  document.getElementById('product-modal-title').textContent = 'Agregar producto';
  ['f-nombre','f-cat','f-prov','f-stock','f-min','f-precio','f-unidad','f-sku'].forEach(id => {
    document.getElementById(id).value = '';
  });
  pendingPhotoFile = null;
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('photo-placeholder').classList.remove('hidden');
  document.getElementById('product-modal').classList.remove('hidden');
}

async function openEditModal(id) {
  const { data: p } = await db.from('products').select('*').eq('id', id).single();
  if (!p) return;
  document.getElementById('edit-id').value = p.id;
  document.getElementById('product-modal-title').textContent = 'Editar producto';
  document.getElementById('f-nombre').value = p.nombre || '';
  document.getElementById('f-cat').value = p.categoria || '';
  document.getElementById('f-prov').value = p.proveedor || '';
  document.getElementById('f-stock').value = p.stock || 0;
  document.getElementById('f-min').value = p.stock_minimo || 0;
  document.getElementById('f-precio').value = p.precio || 0;
  document.getElementById('f-unidad').value = p.unidad || '';
  document.getElementById('f-sku').value = p.sku || '';
  pendingPhotoFile = null;
  if (p.foto_url) {
    const preview = document.getElementById('photo-preview');
    preview.src = p.foto_url;
    preview.classList.remove('hidden');
    document.getElementById('photo-placeholder').classList.add('hidden');
  } else {
    document.getElementById('photo-preview').classList.add('hidden');
    document.getElementById('photo-placeholder').classList.remove('hidden');
  }
  document.getElementById('product-modal').classList.remove('hidden');
}

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('La foto debe ser menor a 2MB', 'error'); return; }
  pendingPhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('photo-preview');
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    document.getElementById('photo-placeholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

async function uploadPhoto(file) {
  const ext = file.name.split('.').pop();
  const path = `products/${Date.now()}.${ext}`;
  const { error } = await db.storage.from('fotos').upload(path, file, { upsert: true });
  if (error) { showToast('Error subiendo foto', 'error'); return null; }
  const { data } = db.storage.from('fotos').getPublicUrl(path);
  return data.publicUrl;
}

async function saveProduct() {
  const nombre = document.getElementById('f-nombre').value.trim();
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }

  const editId = document.getElementById('edit-id').value;

  let foto_url = null;
  if (pendingPhotoFile) {
    foto_url = await uploadPhoto(pendingPhotoFile);
  } else if (editId) {
    const { data: existing } = await db.from('products').select('foto_url').eq('id', editId).single();
    foto_url = existing?.foto_url || null;
  }

  const payload = {
    nombre,
    categoria:    document.getElementById('f-cat').value.trim() || 'General',
    proveedor:    document.getElementById('f-prov').value.trim() || null,
    stock:        parseInt(document.getElementById('f-stock').value) || 0,
    stock_minimo: parseInt(document.getElementById('f-min').value) || 0,
    precio:       parseFloat(document.getElementById('f-precio').value) || 0,
    unidad:       document.getElementById('f-unidad').value.trim() || 'unidad',
    sku:          document.getElementById('f-sku').value.trim() || null,
    foto_url,
    updated_by:   currentUser.email,
  };

  if (editId) {
    const { error } = await db.from('products').update(payload).eq('id', editId);
    if (error) { showToast('Error al guardar', 'error'); return; }
    showToast('Producto actualizado', 'success');
  } else {
    const { error } = await db.from('products').insert({ ...payload, created_by: currentUser.email });
    if (error) { showToast('Error al guardar', 'error'); return; }
    showToast('Producto agregado', 'success');
  }

  closeModal('product-modal');
  renderAll();
}

async function deleteProduct(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Producto eliminado');
  renderAll();
}

// ══════════════════════════════════
// MOVEMENTS
// ══════════════════════════════════
async function fetchMovements() {
  const { data, error } = await db.from('movements').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  return data;
}

function openMovModal(pid, nombre) {
  document.getElementById('mov-pid').value = pid;
  document.getElementById('mov-modal-title').textContent = nombre;
  document.getElementById('mov-cant').value = '';
  document.getElementById('mov-nota').value = '';
  document.getElementById('mov-tipo').value = 'entrada';
  document.getElementById('mov-modal').classList.remove('hidden');
}

async function saveMovimiento() {
  const pid  = document.getElementById('mov-pid').value;
  const tipo = document.getElementById('mov-tipo').value;
  const cant = parseInt(document.getElementById('mov-cant').value);
  const nota = document.getElementById('mov-nota').value.trim();

  if (!cant || cant <= 0) { showToast('Ingresá una cantidad válida', 'error'); return; }

  const { data: p } = await db.from('products').select('*').eq('id', pid).single();
  if (!p) return;

  const prev = p.stock;
  let nuevo;
  if (tipo === 'entrada') nuevo = prev + cant;
  else if (tipo === 'salida') nuevo = Math.max(0, prev - cant);
  else nuevo = cant;

  const { error: pErr } = await db.from('products').update({ stock: nuevo, updated_by: currentUser.email }).eq('id', pid);
  if (pErr) { showToast('Error al actualizar stock', 'error'); return; }

  await db.from('movements').insert({
    product_id:   pid,
    product_name: p.nombre,
    tipo,
    cantidad:     cant,
    stock_prev:   prev,
    stock_nuevo:  nuevo,
    nota:         nota || null,
    user_email:   currentUser.email,
    user_name:    currentUser.user_metadata?.name || currentUser.email,
  });

  closeModal('mov-modal');
  showToast('Movimiento registrado', 'success');
  renderAll();
}

function renderMovements(movements, products) {
  const tbody = document.getElementById('tbody-mov');
  if (!movements.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">📋</span>No hay movimientos aún</div></td></tr>`;
    return;
  }
  tbody.innerHTML = movements.map(m => {
    const fecha = new Date(m.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    const badgeClass = m.tipo === 'entrada' ? 'mov-in' : m.tipo === 'salida' ? 'mov-out' : 'mov-adj';
    const cantDisplay = m.tipo === 'entrada' ? `+${m.cantidad}` : m.tipo === 'salida' ? `-${m.cantidad}` : `=${m.cantidad}`;
    return `<tr>
      <td style="font-size:12px;color:var(--text3);white-space:nowrap">${fecha}</td>
      <td>${m.product_name}</td>
      <td><span class="badge ${badgeClass}">${m.tipo}</span></td>
      <td style="font-family:'DM Mono',monospace">${cantDisplay}</td>
      <td style="color:var(--text3)">${m.stock_prev}</td>
      <td>${m.stock_nuevo}</td>
      <td style="font-size:12px;color:var(--text3)">${m.user_name || m.user_email}</td>
      <td style="font-size:12px;color:var(--text3)">${m.nota || ''}</td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════
// EXCEL EXPORT
// ══════════════════════════════════
async function exportExcel() {
  showToast('Generando Excel...');
  const [products, movements] = await Promise.all([fetchProducts(), fetchMovements()]);

  const wb = XLSX.utils.book_new();

  const prodRows = [
    ['Nombre', 'Categoría', 'Stock', 'Stock mínimo', 'Precio', 'Unidad', 'SKU', 'Proveedor', 'Estado', 'Valor en stock'],
    ...products.map(p => [
      p.nombre, p.categoria, p.stock, p.stock_minimo, p.precio,
      p.unidad, p.sku || '', p.proveedor || '',
      getStatus(p) === 'ok' ? 'Normal' : getStatus(p) === 'low' ? 'Stock bajo' : 'Sin stock',
      (p.stock * (p.precio || 0)).toFixed(2)
    ])
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(prodRows);
  ws1['!cols'] = [22,14,8,12,10,10,12,22,12,14].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Inventario');

  if (movements.length) {
    const movRows = [
      ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Stock ant.', 'Stock nuevo', 'Usuario', 'Nota'],
      ...movements.map(m => [
        new Date(m.created_at).toLocaleString('es-AR'),
        m.product_name, m.tipo, m.cantidad, m.stock_prev, m.stock_nuevo,
        m.user_name || m.user_email, m.nota || ''
      ])
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(movRows);
    ws2['!cols'] = [18,22,10,10,12,12,20,30].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Movimientos');
  }

  const alerts = products.filter(p => getStatus(p) !== 'ok');
  if (alerts.length) {
    const altRows = [
      ['Nombre', 'Categoría', 'Stock', 'Mínimo', 'Estado', 'Proveedor'],
      ...alerts.map(p => [p.nombre, p.categoria, p.stock, p.stock_minimo,
        getStatus(p) === 'low' ? 'Stock bajo' : 'Sin stock', p.proveedor || ''])
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(altRows);
    ws3['!cols'] = [22,14,8,8,12,22].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Alertas');
  }

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `inventario_${fecha}.xlsx`);
  showToast('Excel descargado', 'success');
}

// ══════════════════════════════════
// UI HELPERS
// ══════════════════════════════════
function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function closeIfOverlay(e, id) {
  if (e.target.id === id) closeModal(id);
}

let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function escapeHtml(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ══════════════════════════════════
// BOOT
// ══════════════════════════════════
checkSession();
