// ── CONFIG — reemplazá con tus credenciales de Supabase ──
const SUPABASE_URL = 'https://wcjyycgokxjlqznkaquf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5DB4QScSv_f-3E4zq5Pxdg_2HuPahNv';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser     = null;
let pendingPhotoFile = null;
let cachedProducts  = [];
let cachedMovements = [];

// ══════════════════════════════════
// AUTH
// ══════════════════════════════════
async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) { currentUser = session.user; await showApp(); }
  else showAuth();
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) return showAuthError('Completá email y contraseña.');
  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) return showAuthError('Email o contraseña incorrectos.');
  const { data: { session } } = await db.auth.getSession();
  currentUser = session.user;
  await showApp();
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
  cachedProducts  = [];
  cachedMovements = [];
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  showLogin();
}

async function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const name = currentUser.user_metadata?.name || currentUser.email;
  document.getElementById('nav-user').textContent = '👤 ' + name;
  await loadAll();
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
  el.style.background = isInfo ? 'rgba(59,130,246,0.12)' : '';
  el.style.color      = isInfo ? '#93c5fd' : '';
}
function clearAuthError() { document.getElementById('auth-error').classList.add('hidden'); }

// ══════════════════════════════════
// CARGA PRINCIPAL — trae datos y renderiza todo
// ══════════════════════════════════
async function loadAll() {
  // Traer productos
  const { data: prods, error: e1 } = await db
    .from('products')
    .select('*')
    .order('nombre', { ascending: true });
  if (e1) { showToast('Error cargando productos: ' + e1.message, 'error'); return; }
  cachedProducts = prods || [];

  // Traer movimientos
  const { data: movs, error: e2 } = await db
    .from('movements')
    .select('*')
    .order('fecha_real', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (e2) { showToast('Error cargando movimientos: ' + e2.message, 'error'); return; }
  cachedMovements = movs || [];

  // Renderizar todo
  renderMetrics();
  renderCatFilter();
  renderProducts();
  renderAlerts();
  renderMovements();
  populateInformeSelect();
}

// ══════════════════════════════════
// HELPERS DE ESTADO
// ══════════════════════════════════
function getStatus(p) {
  if (p.stock === 0) return 'out';
  if (p.stock_minimo > 0 && p.stock <= p.stock_minimo) return 'low';
  return 'ok';
}

function statusBadge(p) {
  const s = getStatus(p);
  if (s === 'out') return '<span class="badge badge-out">🚨 Sin stock</span>';
  if (s === 'low') return '<span class="badge badge-low">⚠️ Stock bajo</span>';
  return '<span class="badge badge-ok">✅ Normal</span>';
}

function formatFecha(isoStr) {
  if (!isoStr) return '—';
  const dt = new Date(isoStr);
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatHora(isoStr) {
  if (!isoStr) return '—';
  const dt = new Date(isoStr);
  return dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// ══════════════════════════════════
// RENDER — métricas
// ══════════════════════════════════
function renderMetrics() {
  const total = cachedProducts.length;
  const valor = cachedProducts.reduce((a, p) => a + p.stock * (p.precio || 0), 0);
  const low   = cachedProducts.filter(p => p.stock > 0 && p.stock_minimo > 0 && p.stock <= p.stock_minimo).length;
  const out   = cachedProducts.filter(p => p.stock === 0).length;

  document.getElementById('m-total').textContent = total;
  document.getElementById('m-valor').textContent = '$' + valor.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  document.getElementById('m-low').textContent   = low;
  document.getElementById('m-out').textContent   = out;

  const badge = document.getElementById('alert-badge');
  const count = low + out;
  if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

// ══════════════════════════════════
// RENDER — filtro de categorías
// ══════════════════════════════════
function renderCatFilter() {
  const sel     = document.getElementById('filterCat');
  const current = sel.value;
  const cats    = [...new Set(cachedProducts.map(p => p.categoria).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`).join('');
}

// ══════════════════════════════════
// RENDER — tabla de productos
// ══════════════════════════════════
function renderProducts() {
  const q   = (document.getElementById('search').value || '').toLowerCase();
  const cat = document.getElementById('filterCat').value;

  const filtered = cachedProducts.filter(p =>
    (!q   || p.nombre.toLowerCase().includes(q) || (p.proveedor||'').toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q)) &&
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
        ${p.proveedor ? `<div class="prod-prov">🏭 ${p.proveedor}</div>` : ''}
        ${p.sku       ? `<div class="prod-sku">${p.sku}</div>`           : ''}
      </td>
      <td>${p.categoria || '—'}</td>
      <td><strong style="font-size:17px;font-family:'JetBrains Mono',monospace">${p.stock}</strong> <span style="color:var(--text3);font-size:13px">${p.unidad||''}</span></td>
      <td style="color:var(--text3)">${p.stock_minimo || 0}</td>
      <td style="font-family:'JetBrains Mono',monospace">$${(p.precio||0).toFixed(2)}</td>
      <td>${statusBadge(p)}</td>
      <td>
        <div class="actions">
          <button class="btn-icon" onclick="openMovModal('${p.id}','${escHtml(p.nombre)}')" title="Movimiento">±</button>
          <button class="btn-icon" onclick="openEditModal('${p.id}')" title="Editar">✎</button>
          <button class="btn-icon danger" onclick="deleteProduct('${p.id}','${escHtml(p.nombre)}')" title="Eliminar">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════
// RENDER — alertas
// ══════════════════════════════════
function renderAlerts() {
  const el     = document.getElementById('alerts-list');
  const alerts = cachedProducts.filter(p => getStatus(p) !== 'ok');

  if (!alerts.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">✅</span>Sin alertas activas. ¡Todo el stock está en orden!</div>`;
    return;
  }

  el.innerHTML = alerts.map(p => {
    const s   = getStatus(p);
    const msg = s === 'out'
      ? '🚨 Sin stock — requiere reposición urgente'
      : `⚠️ Stock bajo: ${p.stock} ${p.unidad||''} (mínimo: ${p.stock_minimo})`;
    return `<div class="alert-item ${s}">
      <div>
        <div class="alert-name">${p.nombre}</div>
        <div class="alert-sub">${msg}</div>
      </div>
      <button class="btn-primary" onclick="openMovModal('${p.id}','${escHtml(p.nombre)}')">Reponer →</button>
    </div>`;
  }).join('');
}

// ══════════════════════════════════
// RENDER — movimientos (pestaña general)
// ══════════════════════════════════
function renderMovements() {
  const tbody = document.getElementById('tbody-mov');

  if (!cachedMovements || cachedMovements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">📋</span>No hay movimientos registrados aún</div></td></tr>`;
    return;
  }

  tbody.innerHTML = cachedMovements.map(m => {
    const fechaStr = m.fecha_real || m.created_at;
    const bc = m.tipo === 'entrada' ? 'mov-in' : m.tipo === 'salida' ? 'mov-out' : 'mov-adj';
    const ic = m.tipo === 'entrada' ? '✅' : m.tipo === 'salida' ? '📤' : '🔧';
    const cd = m.tipo === 'entrada' ? `+${m.cantidad}` : m.tipo === 'salida' ? `-${m.cantidad}` : `=${m.cantidad}`;
    return `<tr>
      <td style="white-space:nowrap;font-size:14px">${formatFecha(fechaStr)} ${formatHora(fechaStr)}</td>
      <td style="font-weight:600">${m.product_name}</td>
      <td><span class="badge ${bc}">${ic} ${m.tipo}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:16px">${cd}</td>
      <td style="color:var(--text3)">${m.stock_prev}</td>
      <td style="font-weight:600">${m.stock_nuevo}</td>
      <td style="font-size:14px;color:var(--text3)">${m.user_name || m.user_email || ''}</td>
      <td style="font-size:14px;color:var(--text3)">${m.nota || ''}</td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════
// MODAL PRODUCTO
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
  setTimeout(() => document.getElementById('f-nombre').focus(), 100);
}

function openEditModal(id) {
  const p = cachedProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('edit-id').value   = p.id;
  document.getElementById('product-modal-title').textContent = 'Editar producto';
  document.getElementById('f-nombre').value  = p.nombre       || '';
  document.getElementById('f-cat').value     = p.categoria    || '';
  document.getElementById('f-prov').value    = p.proveedor    || '';
  document.getElementById('f-stock').value   = p.stock        || 0;
  document.getElementById('f-min').value     = p.stock_minimo || 0;
  document.getElementById('f-precio').value  = p.precio       || 0;
  document.getElementById('f-unidad').value  = p.unidad       || '';
  document.getElementById('f-sku').value     = p.sku          || '';
  pendingPhotoFile = null;
  if (p.foto_url) {
    document.getElementById('photo-preview').src = p.foto_url;
    document.getElementById('photo-preview').classList.remove('hidden');
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
  if (file.size > 3 * 1024 * 1024) { showToast('La foto debe ser menor a 3MB', 'error'); return; }
  pendingPhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('photo-preview').src = e.target.result;
    document.getElementById('photo-preview').classList.remove('hidden');
    document.getElementById('photo-placeholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

async function uploadPhoto(file) {
  const ext  = file.name.split('.').pop();
  const path = `products/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
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
    foto_url = cachedProducts.find(p => p.id === editId)?.foto_url || null;
  }

  const payload = {
    nombre,
    categoria:    document.getElementById('f-cat').value.trim()    || 'General',
    proveedor:    document.getElementById('f-prov').value.trim()    || null,
    stock:        parseInt(document.getElementById('f-stock').value)    || 0,
    stock_minimo: parseInt(document.getElementById('f-min').value)      || 0,
    precio:       parseFloat(document.getElementById('f-precio').value) || 0,
    unidad:       document.getElementById('f-unidad').value.trim()  || 'unidad',
    sku:          document.getElementById('f-sku').value.trim()      || null,
    foto_url,
    updated_by:   currentUser.email,
  };

  if (editId) {
    const { error } = await db.from('products').update(payload).eq('id', editId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('✅ Producto actualizado', 'success');
  } else {
    const { error } = await db.from('products').insert({ ...payload, created_by: currentUser.email });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('✅ Producto agregado', 'success');
  }
  closeModal('product-modal');
  await loadAll();
}

async function deleteProduct(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"? No se puede deshacer.`)) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Producto eliminado');
  await loadAll();
}

// ══════════════════════════════════
// MODAL MOVIMIENTO
// ══════════════════════════════════
function openMovModal(pid, nombre) {
  document.getElementById('mov-pid').value               = pid;
  document.getElementById('mov-modal-title').textContent = nombre;
  document.getElementById('mov-cant').value              = '';
  document.getElementById('mov-nota').value              = '';
  document.getElementById('mov-tipo').value              = 'entrada';

  // Fecha/hora actual como default
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dt  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  document.getElementById('mov-fecha').value = dt;

  document.getElementById('mov-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('mov-cant').focus(), 100);
}

async function saveMovimiento() {
  const pid      = document.getElementById('mov-pid').value;
  const tipo     = document.getElementById('mov-tipo').value;
  const cant     = parseInt(document.getElementById('mov-cant').value);
  const nota     = document.getElementById('mov-nota').value.trim();
  const fechaVal = document.getElementById('mov-fecha').value;

  if (!cant || cant <= 0) { showToast('Ingresá una cantidad válida', 'error'); return; }
  if (!fechaVal)          { showToast('La fecha es requerida', 'error');       return; }

  const p = cachedProducts.find(x => x.id === pid);
  if (!p) return;

  const prev = p.stock;
  let nuevo;
  if      (tipo === 'entrada') nuevo = prev + cant;
  else if (tipo === 'salida')  nuevo = Math.max(0, prev - cant);
  else                         nuevo = cant;

  const { error: pErr } = await db.from('products')
    .update({ stock: nuevo, updated_by: currentUser.email })
    .eq('id', pid);
  if (pErr) { showToast('Error actualizando stock: ' + pErr.message, 'error'); return; }

  const { error: mErr } = await db.from('movements').insert({
    product_id:   pid,
    product_name: p.nombre,
    tipo,
    cantidad:     cant,
    stock_prev:   prev,
    stock_nuevo:  nuevo,
    nota:         nota || null,
    fecha_real:   new Date(fechaVal).toISOString(),
    user_email:   currentUser.email,
    user_name:    currentUser.user_metadata?.name || currentUser.email,
  });
  if (mErr) { showToast('Error guardando movimiento: ' + mErr.message, 'error'); return; }

  closeModal('mov-modal');
  showToast('✅ Movimiento registrado', 'success');
  await loadAll();
}

// ══════════════════════════════════
// INFORME POR PRODUCTO
// ══════════════════════════════════
function populateInformeSelect() {
  const sel     = document.getElementById('informe-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Elegí un producto —</option>' +
    cachedProducts.map(p =>
      `<option value="${p.id}"${p.id === current ? ' selected' : ''}>${p.nombre}${p.sku ? ' ('+p.sku+')' : ''}</option>`
    ).join('');
  // Si ya había uno seleccionado, re-renderizar
  if (current) renderInforme();
}

function renderInforme() {
  const pid   = document.getElementById('informe-select').value;
  const desde = document.getElementById('informe-desde').value;
  const hasta = document.getElementById('informe-hasta').value;

  document.getElementById('informe-resumen').classList.add('hidden');
  document.getElementById('informe-tabla').classList.add('hidden');
  document.getElementById('informe-empty').classList.remove('hidden');
  document.getElementById('informe-empty').innerHTML =
    `<span class="empty-icon">📊</span><p>Seleccioná un producto para ver su historial</p>`;

  if (!pid) return;

  // Filtrar movimientos de este producto
  let movs = cachedMovements.filter(m => m.product_id === pid);

  // Filtrar por fechas
  if (desde) {
    const d = new Date(desde + 'T00:00:00');
    movs = movs.filter(m => new Date(m.fecha_real || m.created_at) >= d);
  }
  if (hasta) {
    const h = new Date(hasta + 'T23:59:59');
    movs = movs.filter(m => new Date(m.fecha_real || m.created_at) <= h);
  }

  // Ordenar por fecha desc
  movs.sort((a, b) =>
    new Date(b.fecha_real || b.created_at) - new Date(a.fecha_real || a.created_at)
  );

  // Resumen
  const prod          = cachedProducts.find(p => p.id === pid);
  const totalEntradas = movs.filter(m => m.tipo === 'entrada').reduce((a, m) => a + m.cantidad, 0);
  const totalSalidas  = movs.filter(m => m.tipo === 'salida').reduce((a, m) => a + m.cantidad, 0);

  document.getElementById('inf-stock').textContent    = prod ? `${prod.stock} ${prod.unidad||''}` : '—';
  document.getElementById('inf-entradas').textContent = `+${totalEntradas}`;
  document.getElementById('inf-salidas').textContent  = `-${totalSalidas}`;
  document.getElementById('inf-total').textContent    = movs.length;
  document.getElementById('informe-resumen').classList.remove('hidden');

  if (!movs.length) {
    document.getElementById('informe-empty').innerHTML =
      `<span class="empty-icon">📭</span><p>No hay movimientos en el período seleccionado</p>`;
    return;
  }

  document.getElementById('informe-empty').classList.add('hidden');

  document.getElementById('tbody-informe').innerHTML = movs.map(m => {
    const fechaStr = m.fecha_real || m.created_at;
    const bc = m.tipo === 'entrada' ? 'mov-in' : m.tipo === 'salida' ? 'mov-out' : 'mov-adj';
    const ic = m.tipo === 'entrada' ? '✅' : m.tipo === 'salida' ? '📤' : '🔧';
    const cd = m.tipo === 'entrada' ? `+${m.cantidad}` : m.tipo === 'salida' ? `-${m.cantidad}` : `=${m.cantidad}`;
    return `<tr>
      <td style="white-space:nowrap;font-size:14px">${formatFecha(fechaStr)}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:14px">${formatHora(fechaStr)}</td>
      <td><span class="badge ${bc}">${ic} ${m.tipo}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:17px">${cd}</td>
      <td style="color:var(--text3)">${m.stock_prev}</td>
      <td style="font-weight:700">${m.stock_nuevo}</td>
      <td style="font-size:14px;color:var(--text3)">${m.user_name || m.user_email || ''}</td>
      <td style="font-size:14px;color:var(--text3)">${m.nota || ''}</td>
    </tr>`;
  }).join('');

  document.getElementById('informe-tabla').classList.remove('hidden');
}

function exportInformeExcel() {
  const pid   = document.getElementById('informe-select').value;
  const desde = document.getElementById('informe-desde').value;
  const hasta = document.getElementById('informe-hasta').value;
  if (!pid) { showToast('Seleccioná un producto primero', 'error'); return; }

  const prod = cachedProducts.find(p => p.id === pid);
  let movs   = cachedMovements.filter(m => m.product_id === pid);
  if (desde) movs = movs.filter(m => new Date(m.fecha_real||m.created_at) >= new Date(desde+'T00:00:00'));
  if (hasta) movs = movs.filter(m => new Date(m.fecha_real||m.created_at) <= new Date(hasta+'T23:59:59'));
  movs.sort((a, b) => new Date(b.fecha_real||b.created_at) - new Date(a.fecha_real||a.created_at));

  const wb  = XLSX.utils.book_new();
  const rows = [
    [`Informe — ${prod?.nombre||''}`],
    [`Período: ${desde||'inicio'} al ${hasta||'hoy'}`],
    [`Stock actual: ${prod?.stock} ${prod?.unidad||''}`],
    [],
    ['Fecha','Hora','Tipo','Cantidad','Stock anterior','Stock nuevo','Usuario','Nota'],
    ...movs.map(m => {
      const fechaStr = m.fecha_real || m.created_at;
      return [
        formatFecha(fechaStr),
        formatHora(fechaStr),
        m.tipo,
        m.tipo==='entrada' ? m.cantidad : m.tipo==='salida' ? -m.cantidad : m.cantidad,
        m.stock_prev,
        m.stock_nuevo,
        m.user_name || m.user_email || '',
        m.nota || ''
      ];
    })
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [16,8,10,10,14,14,22,30].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Informe');
  XLSX.writeFile(wb, `informe_${(prod?.nombre||'producto').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('✅ Informe descargado', 'success');
}

// ══════════════════════════════════
// EXCEL GENERAL
// ══════════════════════════════════
async function exportExcel() {
  showToast('Generando Excel...');
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([
    ['Nombre','Categoría','Stock','Stock mínimo','Precio','Unidad','SKU','Proveedor','Estado','Valor en stock'],
    ...cachedProducts.map(p => [
      p.nombre, p.categoria, p.stock, p.stock_minimo, p.precio,
      p.unidad, p.sku||'', p.proveedor||'',
      getStatus(p)==='ok'?'Normal':getStatus(p)==='low'?'Stock bajo':'Sin stock',
      (p.stock*(p.precio||0)).toFixed(2)
    ])
  ]);
  ws1['!cols'] = [24,14,8,12,10,10,12,22,12,14].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws1, 'Inventario');

  if (cachedMovements.length) {
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Fecha','Hora','Producto','Tipo','Cantidad','Stock ant.','Stock nuevo','Usuario','Nota'],
      ...cachedMovements.map(m => {
        const fechaStr = m.fecha_real || m.created_at;
        return [
          formatFecha(fechaStr), formatHora(fechaStr),
          m.product_name, m.tipo, m.cantidad,
          m.stock_prev, m.stock_nuevo,
          m.user_name||m.user_email||'', m.nota||''
        ];
      })
    ]);
    ws2['!cols'] = [14,8,24,10,10,12,12,20,30].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws2, 'Movimientos');
  }

  XLSX.writeFile(wb, `inventario_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('✅ Excel descargado', 'success');
}

// ══════════════════════════════════
// UI HELPERS
// ══════════════════════════════════
function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  el.classList.add('active');
  el.setAttribute('aria-selected', 'true');

  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });

  const target = document.getElementById('view-' + name);
  target.classList.remove('hidden');
  target.classList.add('active');

  if (name === 'informe') renderInforme();
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeIfOverlay(e, id) { if (e.target.id === id) closeModal(id); }

let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function escHtml(str) {
  return (str||'').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ── INICIO ──
checkSession();
