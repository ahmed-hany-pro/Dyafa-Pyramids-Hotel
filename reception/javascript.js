// ━━━━━━━━━━━━━━━━ DATA ━━━━━━━━━━━━━━━━
const ROOM_TYPES = [
  { id:'standard', name:'Standard Room', rooms:[
    {num:'101',name:'City View'},{num:'102',name:'City View'},
    {num:'103',name:'Garden View'},{num:'104',name:'Garden View'},
  ]},
  { id:'deluxe', name:'Deluxe Room', rooms:[
    {num:'201',name:'Sea View'},{num:'202',name:'Sea View'},{num:'203',name:'Pool View'},
  ]},
  { id:'suite', name:'Junior Suite', rooms:[
    {num:'301',name:'Corner Suite'},{num:'302',name:'Panoramic'},
  ]},
  { id:'presidential', name:'Presidential Suite', rooms:[
    {num:'401',name:'Grand Presidential'},
  ]},
];

// Bookings live in Supabase. This array is shared with the data layer (js/dyafa-store.js), which loads it before this file runs,
// keeps it in sync with other devices, and saves every change (saveBookings() is called from updateStats()).
const bookings = DyafaStore.bookingList;
function saveBookings() { DyafaStore.saveBookings(); }

let currentDate = new Date();
let activeBookingId = null;
const CELL_W = 44;
let viewMode = 'all';

// ━━━━━━━━━━━━━━━━ BILLING ━━━━━━━━━━━━━━━━
// Payments are applied to the bills oldest-first; a bill is "paid" once payments fully cover it.
function settleBills(b) {
  let pool = b.payments.reduce((s, p) => s + p.amount, 0);
  b.bills.forEach(bl => {
    if (pool >= bl.amount) { bl.paid = true; pool -= bl.amount; }
    else { bl.paid = false; pool = 0; }
  });
}

// Who ordered this charge (name shown after "Welcome,"); also works for older charges via their linked order
function billBy(bl) {
  if (bl.by) return bl.by;
  if (!bl.orderId) return '';
  const o = DyafaStore.orders().find(x => x.id === bl.orderId); if (!o) return '';
  const rq = DyafaStore.get(o.requestId);
  return cleanTxt((rq && rq.companionName) || o.guestName || '');
}

// Row shown when a guest paid MORE than the total charges: the money left over to give back / keep as credit.
function remainingRow(balance) {
  if (balance >= 0) return '';
  return `<div class="summary-row remaining-row"><span>💵 Remaining (paid extra)</span><span>$ ${Math.abs(balance).toLocaleString()}</span></div>`;
}

// ━━━━━━━━━━━━━━━━ HELPERS ━━━━━━━━━━━━━━━━
// BUG FIX: Compare date strings to avoid time-of-day affecting "past" detection
function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// A room can't be booked twice for the same night. Check-out day is free for a new check-in
// (a stay occupies the nights from check-in up to, but not including, check-out).
function findRoomClash(roomNum, checkIn, checkOut, ignoreId = null) {
  return bookings.find(x => x.id !== ignoreId && x.roomNum === roomNum && x.status !== 'checked-out'
    && x.checkIn < checkOut && x.checkOut > checkIn);
}
function clashMessage(roomNum, c) {
  return `Room ${roomNum} is already booked by ${c.guestName} (${c.checkIn} → ${c.checkOut}). A new check-in is only possible on or after ${c.checkOut}.`;
}

// ━━━━━━━━━━━━━━━━ STATS ━━━━━━━━━━━━━━━━
function updateStats() {
  saveBookings();
  updateRequestBadge();
  const lb = document.getElementById('listBadge'); if (lb) lb.textContent = bookings.length;
  document.getElementById('statIn').textContent    = bookings.filter(b => b.status === 'checked-in').length + ' In-House';
  document.getElementById('statRes').textContent   = bookings.filter(b => b.status === 'pending').length + ' Reserved';
  document.getElementById('statUnpaid').textContent= bookings.filter(b => b.bills.some(bl => !bl.paid)).length + ' Unpaid';
}

// ━━━━━━━━━━━━━━━━ VIEW MODE ━━━━━━━━━━━━━━━━
function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('btn-all').classList.toggle('active', mode === 'all');
  document.getElementById('btn-single').classList.toggle('active', mode === 'single');
  document.getElementById('allMonthsControls').style.display  = mode === 'all' ? 'flex' : 'none';
  document.getElementById('singleMonthControls').style.display = mode === 'single' ? 'flex' : 'none';
  renderCalendar();
  setTimeout(scrollToToday, 80);
}

// ━━━━━━━━━━━━━━━━ MONTHS ━━━━━━━━━━━━━━━━
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

function getMonthsToRender() {
  if (viewMode === 'single') return [{ year: currentDate.getFullYear(), month: currentDate.getMonth() }];
  const range = parseInt(document.getElementById('rangeSelect')?.value || 6);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return Array.from({ length: range + 2 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
}

function getTodayColumnOffset() {
  const today = new Date();
  const todayStr = toDateStr(today);
  let offset = 0;
  for (const { year, month } of getMonthsToRender()) {
    const days = getDaysInMonth(year, month);
    for (let d = 1; d <= days; d++) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (ds === todayStr) return offset;
      offset += CELL_W;
    }
  }
  return 0;
}

function scrollToToday() {
  const ga = document.getElementById('calendarWrapper');   // the wrapper is the one scroll container (labels + header stay sticky)
  if (!ga) return;
  if (viewMode === 'single') {
    const t = new Date();
    if (t.getFullYear() === currentDate.getFullYear() && t.getMonth() === currentDate.getMonth()) {
      ga.scrollLeft = (t.getDate() - 1) * CELL_W;
    } else {
      ga.scrollLeft = 0;
    }
  } else {
    ga.scrollLeft = getTodayColumnOffset();
  }
}

// ━━━━━━━━━━━━━━━━ RENDER ━━━━━━━━━━━━━━━━
function renderCalendar() {
  const months = getMonthsToRender();
  const todayStr = toDateStr(new Date());
  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  if (viewMode === 'single') {
    document.getElementById('monthTitle').textContent =
      new Date(currentDate.getFullYear(), currentDate.getMonth())
        .toLocaleDateString('en-US', { month:'long', year:'numeric' });
  }

  // Day headers
  const daysHeader = document.getElementById('daysHeader');
  daysHeader.innerHTML = '';
  months.forEach(({ year, month }) => {
    const days = getDaysInMonth(year, month);
    const mShort = new Date(year, month).toLocaleDateString('en-US', { month:'short', year:'2-digit' });
    for (let d = 1; d <= days; d++) {
      const dt = new Date(year, month, d);
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday   = ds === todayStr;
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const isPast    = ds < todayStr;  // BUG FIX: use string comparison, not Date object
      const isBound   = d === 1 && viewMode === 'all';
      const cell = document.createElement('div');
      cell.className = ['day-cell-header',
        isToday ? 'today' : '',
        isWeekend ? 'weekend' : '',
        isPast ? 'past-col' : '',
        isBound ? 'month-boundary-header' : ''
      ].filter(Boolean).join(' ');
      cell.innerHTML = `<div class="day-num">${d}</div><span>${dayNames[dt.getDay()]}</span>`;
      if (isBound) {
        const pin = document.createElement('div');
        pin.className = 'month-label-pin';
        pin.textContent = mShort;
        cell.appendChild(pin);
      }
      daysHeader.appendChild(cell);
    }
  });

  // Labels + Grid
  const roomLabels = document.getElementById('roomLabels');
  roomLabels.innerHTML = '<div class="label-header">Rooms</div>';
  const gridBody = document.getElementById('gridBody');
  gridBody.innerHTML = '';

  ROOM_TYPES.forEach(type => {
    const tl = document.createElement('div');
    tl.className = 'type-label';
    tl.innerHTML = `<div class="tlbar"></div>${type.name}`;
    roomLabels.appendChild(tl);

    const spacer = document.createElement('div');
    spacer.className = 'type-spacer-row';
    months.forEach(({ year, month }) => {
      const days = getDaysInMonth(year, month);
      for (let d = 1; d <= days; d++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const classes = ['type-spacer-cell'];
        if (d === 1 && viewMode === 'all') classes.push('month-boundary');
        if (ds === todayStr) classes.push('today-col');
        const c = document.createElement('div');
        c.className = classes.join(' ');
        spacer.appendChild(c);
      }
    });
    gridBody.appendChild(spacer);

    type.rooms.forEach(room => {
      const lr = document.createElement('div');
      lr.className = 'room-label-row';
      lr.innerHTML = `<div class="room-num">${room.num}</div><div class="room-name">${room.name}</div>`;
      roomLabels.appendChild(lr);

      const gridRow = document.createElement('div');
      gridRow.className = 'grid-row';
      gridRow.dataset.room = room.num;

      months.forEach(({ year, month }) => {
        const days = getDaysInMonth(year, month);
        for (let d = 1; d <= days; d++) {
          const dt = new Date(year, month, d);
          const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const isToday   = ds === todayStr;
          const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
          const isPast    = ds < todayStr;  // BUG FIX: consistent date string comparison
          const isBound   = d === 1 && viewMode === 'all';
          const cell = document.createElement('div');
          cell.className = ['grid-cell',
            isToday ? 'today-col' : '',
            isWeekend ? 'weekend-col' : '',
            isPast ? 'past-col' : '',
            isBound ? 'month-boundary' : ''
          ].filter(Boolean).join(' ');
          cell.title = `Room ${room.num} — ${dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`;
          cell.addEventListener('click', () => handleCellClick(room.num, ds));
          gridRow.appendChild(cell);
        }
      });

      gridBody.appendChild(gridRow);
      bookings.filter(b => b.roomNum === room.num).forEach(bk => renderBookingBar(bk, gridRow, months));
    });
  });

  updateStats();
}

// ━━━━━━━━━━━━━━━━ BOOKING BAR ━━━━━━━━━━━━━━━━
function renderBookingBar(booking, gridRow, months) {
  const cin  = booking.checkIn;   // date strings (YYYY-MM-DD)
  const cout = booking.checkOut;
  const dates = [];               // date string of every rendered column
  for (const { year, month } of months) {
    const days = getDaysInMonth(year, month);
    for (let d = 1; d <= days; d++) dates.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  if (!dates.length || cout <= dates[0] || cin > dates[dates.length - 1]) return;   // nothing visible

  // The bar starts in the MIDDLE of the check-in day and ends in the MIDDLE of the check-out day,
  // so on a changeover day the leaving guest takes the left half and the arriving guest the right half.
  const inIdx  = dates.indexOf(cin);
  const outIdx = dates.indexOf(cout);
  const startX = inIdx  >= 0 ? (inIdx  + 0.5) * CELL_W : 0;                    // before range -> start at the edge
  const endX   = outIdx >= 0 ? (outIdx + 0.5) * CELL_W : dates.length * CELL_W; // after range  -> end at the edge
  const GAP = 2;

  const cinDate  = new Date(booking.checkIn);
  const coutDate = new Date(booking.checkOut);
  const nights   = Math.round((coutDate - cinDate) / 86400000);
  const hasUnpaid = booking.bills.some(b => !b.paid);

  const bar = document.createElement('div');
  bar.className = `booking-bar ${booking.status}${hasUnpaid ? ' has-unpaid' : ''}`;
  bar.style.left  = `${startX + GAP}px`;
  bar.style.width = `${Math.max(endX - startX - GAP * 2, 10)}px`;
  const icon = booking.status === 'checked-in' ? '●' : booking.status === 'pending' ? '◎' : '✓';
  bar.innerHTML = `<span class="bar-icon">${icon}</span><span class="bar-name">${booking.guestName}</span><span class="bar-nights">${nights}n</span>`;
  bar.title = `${booking.guestName}\n${booking.checkIn} → ${booking.checkOut} (${nights} nights)`;
  bar.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showContextMenu(e, booking.id); });
  bar.addEventListener('click',       e => { e.stopPropagation(); showContextMenu(e, booking.id); });
  gridRow.appendChild(bar);
}

// ━━━━━━━━━━━━━━━━ CONTEXT MENU ━━━━━━━━━━━━━━━━
function showContextMenu(e, bookingId) {
  hideContextMenu();
  activeBookingId = bookingId;
  const bk = bookings.find(b => b.id === bookingId);
  const hasUnpaid = bk.bills.some(b => !b.paid);
  const menu = document.getElementById('contextMenu');
  const nights   = Math.round((new Date(bk.checkOut) - new Date(bk.checkIn)) / 86400000);
  const badgeCls = bk.status === 'checked-in' ? 'badge-in' : bk.status === 'pending' ? 'badge-pending' : 'badge-out';
  const badgeTxt = bk.status === 'checked-in' ? '● In-House' : bk.status === 'pending' ? '◎ Reserved' : '✓ Checked Out';

  // BUG FIX: checkout item uses proper conditional — disabled class when unpaid instead of empty onclick
  menu.innerHTML = `
    <div class="ctx-head">
      <div class="ctx-guest">${bk.guestName}</div>
      <div class="ctx-room">Room ${bk.roomNum} · ${nights} nights</div>
      <span class="ctx-badge badge ${badgeCls}">${badgeTxt}</span>
    </div>
    ${bk.status === 'pending' ? `<div class="ctx-item" onclick="doCheckIn('${bookingId}')"><span class="mi">🚪</span> Check In</div>` : ''}
    ${bk.status === 'checked-in' ? `
      <div class="ctx-item ${hasUnpaid ? 'disabled' : 'danger'}" ${hasUnpaid ? '' : `onclick="doCheckOut('${bookingId}')"`}>
        <span class="mi">🏁</span> Check Out
        ${hasUnpaid ? '<span style="margin-left:auto;font-size:9px;background:var(--danger-dim);color:var(--danger);padding:2px 6px;border-radius:4px">Unpaid</span>' : ''}
      </div>` : ''}
    ${bk.status === 'checked-in' ? (hasGuestAccess(bk.id)
      ? `<div class="ctx-item danger" onclick="removeGuestAccess('${bookingId}')"><span class="mi">🔒</span> Remove Guest Services access</div>`
      : `<div class="ctx-item" onclick="addGuestAccess('${bookingId}')"><span class="mi">🔑</span> Add Guest Services access</div>`) : ''}
    <div class="ctx-sep"></div>
    <div class="ctx-item" onclick="openBillsModal('${bookingId}')"><span class="mi">📋</span> Bills & Charges</div>
    <div class="ctx-item" onclick="openPaymentModal('${bookingId}')"><span class="mi">💳</span> Add Payment</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" onclick="openInvoiceModal('${bookingId}')"><span class="mi">🧾</span> View Invoice</div>
    <div class="ctx-item" onclick="openEditModal('${bookingId}')"><span class="mi">✏️</span> Edit Booking</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" onclick="deleteBooking('${bookingId}')"><span class="mi">🗑</span> Delete Booking</div>`;

  menu.style.display = 'block';
  let x = e.clientX, y = e.clientY;
  if (x + 240 > window.innerWidth) x = window.innerWidth - 248;
  if (y + menu.scrollHeight + 20 > window.innerHeight) y = y - menu.scrollHeight;
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
}

function hideContextMenu() {
  const menu = document.getElementById('contextMenu');
  if (menu) menu.style.display = 'none';
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideContextMenu(); closeModal(); } });

// ━━━━━━━━━━━━━━━━ ACTIONS ━━━━━━━━━━━━━━━━
function doCheckIn(id) {
  hideContextMenu();
  const b = bookings.find(b => b.id === id);
  const clash = findRoomClash(b.roomNum, b.checkIn, b.checkOut, id);
  if (clash) { showToast('⚠', clashMessage(b.roomNum, clash), 'error'); return; }
  b.status = 'checked-in';
  renderCalendar();
  showToast('✓', `${b.guestName} checked in — Room ${b.roomNum}`, 'success');
}

function doCheckOut(id) {
  hideContextMenu();
  const b = bookings.find(b => b.id === id);
  if (b.bills.some(bl => !bl.paid)) { showToast('⚠', 'Settle all bills before checkout', 'error'); return; }
  b.status = 'checked-out';
  const revoked = DyafaStore.checkOut(b.id, b.roomNum);   // guest is logged out of Guest Services
  renderCalendar();
  showToast('✓', `${b.guestName} checked out${revoked ? ' — Guest Services access removed' : ''}`, 'info');
}

function deleteBooking(id, fromList = false) {
  hideContextMenu();
  const bk = bookings.find(b => b.id === id);
  if (!bk) return;
  if (!confirm(`Delete the booking for ${bk.guestName} (Room ${bk.roomNum}) permanently?`)) return;
  DyafaStore.checkOut(bk.id, bk.roomNum);
  bookings.splice(bookings.findIndex(b => b.id === id), 1);
  renderCalendar();            // removes it from the timetable
  showToast('🗑', 'Booking deleted', 'info');
  if (fromList) openBookingListModal();   // and from the list
}

function handleCellClick(roomNum, dateStr) { openNewBookingModal(roomNum, dateStr); }

// ━━━━━━━━━━━━━━━━ MODALS ━━━━━━━━━━━━━━━━
function closeModal() { document.getElementById('modalContainer').innerHTML = ''; }
function openModal(html) {
  document.getElementById('modalContainer').innerHTML =
    `<div class="modal-overlay" onclick="if(event.target===this)closeModal()">${html}</div>`;
}

// NEW BOOKING
function openNewBookingModal(roomNum = '', checkInDate = '') {
  hideContextMenu();
  const allRooms = ROOM_TYPES.flatMap(t => t.rooms.map(r => ({ num: r.num, type: t.name })));
  const opts = allRooms.map(r => `<option value="${r.num}" ${r.num === roomNum ? 'selected' : ''}>${r.num} — ${r.type}</option>`).join('');
  openModal(`<div class="modal">
    <div class="modal-header"><div class="modal-title">New Booking</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-section">Guest Information</div>
      <div class="form-grid">
        <div class="form-group full"><label>Full Name</label><input id="nb_name" type="text" placeholder="e.g. John Smith" /></div>
        <div class="form-group"><label>Phone</label><input id="nb_phone" type="text" placeholder="+20 100 000 0000" /></div>
        <div class="form-group"><label>Email</label><input id="nb_email" type="email" placeholder="guest@email.com" /></div>
        <div class="form-group"><label>Nationality</label><input id="nb_nationality" type="text" placeholder="e.g. Egyptian" /></div>
        <div class="form-group"><label>ID / Passport</label><input id="nb_id" type="text" placeholder="National ID or Passport" /></div>
      </div>
      <div class="form-section" style="margin-top:18px">Stay Details</div>
      <div class="form-grid">
        <div class="form-group"><label>Room</label><select id="nb_room">${opts}</select></div>
        <div class="form-group"><label>Status</label>
          <select id="nb_status">
            <option value="pending">Reserved (Pending)</option>
            <option value="checked-in">Check In Now</option>
          </select>
        </div>
        <div class="form-group"><label>Check-In Date</label><input id="nb_checkin" type="date" value="${checkInDate}" /></div>
        <div class="form-group"><label>Check-Out Date</label><input id="nb_checkout" type="date" /></div>
        <div class="form-group"><label>Adults</label><input id="nb_adults" type="number" value="1" min="1" max="10" /></div>
        <div class="form-group"><label>Children</label><input id="nb_children" type="number" value="0" min="0" max="10" /></div>
        <div class="form-group full"><label>Notes</label><textarea id="nb_notes" placeholder="Special requests, notes…"></textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveNewBooking()">Create Booking</button>
    </div>
  </div>`);
}

function saveNewBooking() {
  const name     = document.getElementById('nb_name').value.trim();
  const roomNum  = document.getElementById('nb_room').value;
  const checkIn  = document.getElementById('nb_checkin').value;
  const checkOut = document.getElementById('nb_checkout').value;
  if (!name || !roomNum || !checkIn || !checkOut) { showToast('⚠', 'Fill all required fields', 'error'); return; }
  if (checkOut <= checkIn) { showToast('⚠', 'Check-out must be after check-in', 'error'); return; }
  if (document.getElementById('nb_status').value !== 'checked-out') {
    const clash = findRoomClash(roomNum, checkIn, checkOut);
    if (clash) { showToast('⚠', clashMessage(roomNum, clash), 'error'); return; }
  }
  bookings.push({
    id: 'b' + Date.now(), roomNum, guestName: name,
    phone:       document.getElementById('nb_phone').value,
    email:       document.getElementById('nb_email').value,
    nationality: document.getElementById('nb_nationality').value,
    idNumber:    document.getElementById('nb_id').value,
    checkIn, checkOut,
    status:   document.getElementById('nb_status').value,
    adults:   parseInt(document.getElementById('nb_adults').value)   || 1,
    children: parseInt(document.getElementById('nb_children').value) || 0,
    notes:    document.getElementById('nb_notes').value,
    bills: [], payments: []
  });
  closeModal();
  renderCalendar();
  showToast('✓', `Booking created for ${name}`, 'success');
}

// EDIT BOOKING
function openEditModal(id, fromList = false) {
  hideContextMenu();
  const b = bookings.find(bk => bk.id === id);
  const allRooms = ROOM_TYPES.flatMap(t => t.rooms.map(r => ({ num: r.num, type: t.name })));
  const opts = allRooms.map(r => `<option value="${r.num}" ${r.num === b.roomNum ? 'selected' : ''}>${r.num} — ${r.type}</option>`).join('');
  openModal(`<div class="modal">
    <div class="modal-header"><div class="modal-title">Edit Booking</div><button class="modal-close" onclick="${fromList ? 'openBookingListModal()' : 'closeModal()'}">✕</button></div>
    <div class="modal-body">
      <div class="form-section">Guest Information</div>
      <div class="form-grid">
        <div class="form-group full"><label>Full Name</label><input id="eb_name" type="text" value="${escH(b.guestName)}" /></div>
        <div class="form-group"><label>Phone</label><input id="eb_phone" type="text" value="${escH(b.phone)}" /></div>
        <div class="form-group"><label>Email</label><input id="eb_email" type="email" value="${escH(b.email)}" /></div>
        <div class="form-group"><label>Nationality</label><input id="eb_nationality" type="text" value="${escH(b.nationality)}" /></div>
        <div class="form-group"><label>ID / Passport</label><input id="eb_id" type="text" value="${escH(b.idNumber)}" /></div>
      </div>
      <div class="form-section" style="margin-top:18px">Stay Details</div>
      <div class="form-grid">
        <div class="form-group"><label>Room</label><select id="eb_room">${opts}</select></div>
        <div class="form-group"><label>Status</label>
          <select id="eb_status">
            <option value="pending" ${b.status === 'pending' ? 'selected' : ''}>Reserved (Pending)</option>
            <option value="checked-in" ${b.status === 'checked-in' ? 'selected' : ''}>Checked In</option>
            <option value="checked-out" ${b.status === 'checked-out' ? 'selected' : ''}>Checked Out</option>
          </select>
        </div>
        <div class="form-group"><label>Check-In</label><input id="eb_checkin" type="date" value="${b.checkIn}" /></div>
        <div class="form-group"><label>Check-Out</label><input id="eb_checkout" type="date" value="${b.checkOut}" /></div>
        <div class="form-group"><label>Adults</label><input id="eb_adults" type="number" value="${b.adults}" min="1" /></div>
        <div class="form-group"><label>Children</label><input id="eb_children" type="number" value="${b.children}" min="0" /></div>
        <div class="form-group full"><label>Notes</label><textarea id="eb_notes">${escH(b.notes)}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="${fromList ? 'openBookingListModal()' : 'closeModal()'}">Cancel</button>
      <button class="btn primary" onclick="saveEditBooking('${id}', ${fromList})">Save Changes</button>
    </div>
  </div>`);
}

function saveEditBooking(id, fromList = false) {
  const b = bookings.find(bk => bk.id === id);
  const name = document.getElementById('eb_name').value.trim();
  const room = document.getElementById('eb_room').value;
  const cin  = document.getElementById('eb_checkin').value;
  const cout = document.getElementById('eb_checkout').value;
  if (!name || !room || !cin || !cout) { showToast('⚠', 'Fill all required fields', 'error'); return; }
  if (cout <= cin) { showToast('⚠', 'Check-out must be after check-in', 'error'); return; }
  const status = document.getElementById('eb_status').value;
  if (status !== 'checked-out') {
    const clash = findRoomClash(room, cin, cout, id);
    if (clash) { showToast('⚠', clashMessage(room, clash), 'error'); return; }
  }
  b.guestName  = name;
  b.phone      = document.getElementById('eb_phone').value;
  b.email      = document.getElementById('eb_email').value;
  b.nationality= document.getElementById('eb_nationality').value;
  b.idNumber   = document.getElementById('eb_id').value;
  b.roomNum    = room;
  b.checkIn    = cin;
  b.checkOut   = cout;
  b.status     = status;
  b.adults     = parseInt(document.getElementById('eb_adults').value)   || 1;
  b.children   = parseInt(document.getElementById('eb_children').value) || 0;
  b.notes      = document.getElementById('eb_notes').value;
  DyafaStore.all().forEach(r => { if (r.status === 'approved' && r.bookingId === b.id) DyafaStore.update(r.id, { roomNumber: b.roomNum, name: b.guestName }); });
  if (status === 'checked-out') DyafaStore.checkOut(b.id, b.roomNum);
  renderCalendar();            // updates the timetable
  showToast('✓', 'Booking updated', 'success');
  if (fromList) openBookingListModal(); else closeModal();
}

// ━━━━━━━━━━━━━━━━ BOOKING LIST ━━━━━━━━━━━━━━━━
let listFilter = { q: '', status: 'all' };

function openBookingListModal() {
  hideContextMenu();
  openModal(`<div class="modal" style="width:920px;max-width:96vw" id="listModal">
    <div class="modal-header"><div class="modal-title">Booking List <span id="listTotal" style="font-size:13px;color:var(--text-3);font-family:Inter,sans-serif"></span></div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="list-toolbar">
        <input id="bl_search" type="text" placeholder="Search guest, room, phone…" value="${escH(listFilter.q)}" oninput="listFilter.q=this.value;renderBookingListRows()" />
        <select id="bl_status" onchange="listFilter.status=this.value;renderBookingListRows()">
          <option value="all">All statuses</option>
          <option value="pending">Reserved</option>
          <option value="checked-in">Checked In</option>
          <option value="checked-out">Checked Out</option>
        </select>
        <button class="btn primary" onclick="openNewBookingModal()">＋ New Booking</button>
      </div>
      <div style="overflow-x:auto"><table class="items-table">
        <thead><tr><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Nights</th><th>Status</th><th>Balance</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody id="bl_rows"></tbody>
      </table></div>
    </div></div>`);
  document.getElementById('bl_status').value = listFilter.status;
  renderBookingListRows();
}

function renderBookingListRows() {
  const tbody = document.getElementById('bl_rows'); if (!tbody) return;
  const q = normTxt(listFilter.q);
  const list = bookings
    .filter(b => listFilter.status === 'all' || b.status === listFilter.status)
    .filter(b => !q || normTxt([b.guestName, b.roomNum, b.phone, b.email, b.idNumber, b.nationality].join(' ')).includes(q))
    .sort((a, b) => a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0);
  const tot = document.getElementById('listTotal');
  if (tot) tot.textContent = `(${list.length}${list.length !== bookings.length ? ' of ' + bookings.length : ''})`;
  tbody.innerHTML = list.map(b => {
    const nights = Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000);
    const cls = b.status === 'checked-in' ? 'badge-in' : b.status === 'pending' ? 'badge-pending' : 'badge-out';
    const txt = b.status === 'checked-in' ? '● In-House' : b.status === 'pending' ? '◎ Reserved' : '✓ Checked Out';
    const bal = b.bills.reduce((s, x) => s + x.amount, 0) - b.payments.reduce((s, p) => s + p.amount, 0);
    return `<tr>
      <td><b>${escH(b.guestName)}</b><div style="font-size:11px;color:var(--text-3)">${escH(b.phone || b.email || '')}</div></td>
      <td>${escH(b.roomNum)}</td><td>${escH(b.checkIn)}</td><td>${escH(b.checkOut)}</td><td>${nights}</td>
      <td><span class="badge ${cls}">${txt}</span></td>
      <td style="color:${bal > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${bal > 0 ? '$ ' + bal.toLocaleString() : '✓ Settled'}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn" style="padding:4px 10px;font-size:11px" onclick="openEditModal('${b.id}', true)">✏️ Edit</button>
        <button class="btn danger-btn" style="padding:4px 10px;font-size:11px" onclick="deleteBooking('${b.id}', true)">🗑 Delete</button>
      </td></tr>`;
  }).join('') || '<tr><td colspan="8" style="color:var(--text-3);text-align:center;padding:24px;font-style:italic">No bookings found</td></tr>';
}

// BILLS
function openBillsModal(id) { hideContextMenu(); renderBillsModal(id); }
function renderBillsModal(id) {
  const b = bookings.find(bk => bk.id === id);
  const totalBills = b.bills.reduce((s, bl) => s + bl.amount, 0);
  const totalPaid  = b.payments.reduce((s, p) => s + p.amount, 0);
  const balance    = totalBills - totalPaid;
  const rows = b.bills.map(bl => `<tr>
    <td>${bl.date}</td><td>${bl.desc}${billBy(bl) ? `<div class="bill-by">👤 Ordered by ${escH(billBy(bl))}</div>` : ''}</td>
    <td style="text-align:right;font-weight:600">$ ${bl.amount.toLocaleString()}</td>
    <td><span class="badge ${bl.paid ? 'badge-paid' : 'badge-unpaid'}">${bl.paid ? '✓ Paid' : 'Unpaid'}</span></td>
    <td class="act-cell"><div class="act-wrap">
      ${!bl.paid ? `<button class="btn ghost" style="padding:4px 10px;font-size:10px" onclick="markBillPaid('${id}','${bl.id}')">Mark Paid</button>` : ''}
      <button class="btn danger-btn" style="padding:4px 10px;font-size:10px" onclick="deleteBill('${id}','${bl.id}')">✕</button>
    </div></td></tr>`).join('');
  openModal(`<div class="modal" style="width:640px">
    <div class="modal-header"><div class="modal-title">Bills — ${b.guestName}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <table class="items-table">
        <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="color:var(--text-3);text-align:center;padding:20px;font-style:italic">No charges yet</td></tr>'}</tbody>
      </table>
      <div class="summary-box">
        <div class="summary-row"><span>Total Charged</span><span style="font-weight:600">$ ${totalBills.toLocaleString()}</span></div>
        <div class="summary-row"><span style="color:var(--success)">Total Paid</span><span style="color:var(--success);font-weight:600">$ ${totalPaid.toLocaleString()}</span></div>
        <div class="summary-row total"><span>Balance Due</span><span style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}">$ ${Math.max(balance, 0).toLocaleString()}</span></div>
        ${remainingRow(balance)}
      </div>
      <div class="form-section" style="margin-top:20px">Add New Charge</div>
      <div class="form-grid">
        <div class="form-group"><label>Description</label><input id="bill_desc" type="text" placeholder="e.g. Room Service" /></div>
        <div class="form-group"><label>Amount ($)</label><input id="bill_amount" type="number" placeholder="0.00" min="0" /></div>
        <div class="form-group"><label>Date</label><input id="bill_date" type="date" value="${new Date().toISOString().split('T')[0]}" /></div>
        <div class="form-group" style="align-self:flex-end"><button class="btn primary" onclick="addBill('${id}')">Add Charge</button></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn" onclick="openPaymentModal('${id}')">Add Payment</button>
      <button class="btn primary" onclick="openInvoiceModal('${id}')">🧾 Invoice</button>
    </div>
  </div>`);
}

function addBill(id) {
  const b      = bookings.find(bk => bk.id === id);
  const desc   = document.getElementById('bill_desc').value.trim();
  const amount = parseFloat(document.getElementById('bill_amount').value);
  const date   = document.getElementById('bill_date').value;
  if (!desc || isNaN(amount) || amount <= 0) { showToast('⚠', 'Enter description and valid amount', 'error'); return; }
  b.bills.push({ id: 'bi' + Date.now(), desc, amount, paid: false, date });
  settleBills(b);
  renderBillsModal(id);
  renderCalendar();
  showToast('✓', 'Charge added', 'success');
}

function markBillPaid(bookingId, billId) {
  const b = bookings.find(x => x.id === bookingId);
  const bl = b.bills.find(x => x.id === billId);
  b.payments.push({ id: 'p' + Date.now(), amount: bl.amount, method: 'Cash', ref: 'Marked paid', date: toDateStr(new Date()) });
  settleBills(b);
  renderBillsModal(bookingId);
  renderCalendar();
  showToast('✓', 'Marked as paid', 'success');
}

function deleteBill(bookingId, billId) {
  const b = bookings.find(bk => bk.id === bookingId);
  b.bills = b.bills.filter(bl => bl.id !== billId);
  settleBills(b);
  renderBillsModal(bookingId);
  renderCalendar();
}

// PAYMENTS
function openPaymentModal(id) {
  hideContextMenu();
  const b = bookings.find(bk => bk.id === id);
  const totalBills = b.bills.reduce((s, bl) => s + bl.amount, 0);
  const totalPaid  = b.payments.reduce((s, p) => s + p.amount, 0);
  const balance    = totalBills - totalPaid;
  const rows = b.payments.map(p => `<tr>
    <td>${p.date}</td><td>${p.method}</td>
    <td style="font-size:11px;color:var(--text-3)">${p.ref}</td>
    <td style="text-align:right;color:var(--success);font-weight:600">$ ${p.amount.toLocaleString()}</td>
    <td><button class="btn danger-btn" style="padding:4px 10px;font-size:10px" onclick="deletePayment('${id}','${p.id}')">✕</button></td>
  </tr>`).join('');
  openModal(`<div class="modal" style="width:640px">
    <div class="modal-header"><div class="modal-title">Payments — ${b.guestName}</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="summary-box" style="margin-bottom:16px">
        <div class="summary-row"><span>Total Charged</span><span style="font-weight:600">$ ${totalBills.toLocaleString()}</span></div>
        <div class="summary-row"><span style="color:var(--success)">Total Paid</span><span style="color:var(--success);font-weight:600">$ ${totalPaid.toLocaleString()}</span></div>
        <div class="summary-row total"><span>Balance Due</span><span style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}">$ ${Math.max(balance, 0).toLocaleString()}</span></div>
        ${remainingRow(balance)}
      </div>
      <div class="form-section">Charges</div>
      <table class="items-table" style="margin-bottom:16px">
        <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th style="text-align:center">Status</th></tr></thead>
        <tbody>${b.bills.map(bl => `<tr><td>${bl.date}</td><td>${bl.desc}${billBy(bl) ? `<div class="bill-by">👤 Ordered by ${escH(billBy(bl))}</div>` : ''}</td>
          <td style="text-align:right;font-weight:600">$ ${bl.amount.toLocaleString()}</td>
          <td style="text-align:center"><span class="badge ${bl.paid ? 'badge-paid' : 'badge-unpaid'}">${bl.paid ? '✓ Paid' : 'Unpaid'}</span></td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--text-3);text-align:center;padding:14px;font-style:italic">No charges</td></tr>'}</tbody>
      </table>
      <div class="form-section">Payments</div>
      <table class="items-table">
        <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right">Amount</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="color:var(--text-3);text-align:center;padding:20px;font-style:italic">No payments recorded</td></tr>'}</tbody>
      </table>
      <div class="form-section" style="margin-top:20px">Record Payment</div>
      <div class="form-grid">
        <div class="form-group"><label>Amount ($)</label><input id="pay_amount" type="number" placeholder="${balance > 0 ? balance : 0}" min="0" value="${balance > 0 ? balance : ''}" oninput="updatePayHint(${balance})" />
          <div id="pay_hint" class="pay-hint" style="display:none"></div></div>
        <div class="form-group"><label>Method</label>
          <select id="pay_method"><option>Cash</option><option>Credit Card</option><option>Debit Card</option><option>Bank Transfer</option><option>Cheque</option></select>
        </div>
        <div class="form-group"><label>Reference / Receipt</label><input id="pay_ref" type="text" placeholder="e.g. TXN-0001" /></div>
        <div class="form-group"><label>Date</label><input id="pay_date" type="date" value="${new Date().toISOString().split('T')[0]}" /></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn primary" onclick="addPayment('${id}')">Record Payment</button>
        <button class="btn ghost" onclick="autoMarkPaid('${id}')">Mark All Bills Paid</button>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="openInvoiceModal('${id}')">🧾 Invoice</button>
    </div>
  </div>`);
}

function updatePayHint(balance) {
  const el = document.getElementById('pay_hint'); if (!el) return;
  const v = parseFloat(document.getElementById('pay_amount').value);
  if (!isNaN(v) && v > balance && balance >= 0) {
    el.style.display = 'block';
    el.innerHTML = `💵 Remaining to return: <b>$ ${(v - Math.max(balance, 0)).toLocaleString()}</b>`;
  } else el.style.display = 'none';
}

function addPayment(id) {
  const b      = bookings.find(bk => bk.id === id);
  const amount = parseFloat(document.getElementById('pay_amount').value);
  const method = document.getElementById('pay_method').value;
  const ref    = document.getElementById('pay_ref').value || 'N/A';
  const date   = document.getElementById('pay_date').value;
  if (isNaN(amount) || amount <= 0) { showToast('⚠', 'Enter a valid amount', 'error'); return; }
  const dueBefore = b.bills.reduce((x, bl) => x + bl.amount, 0) - b.payments.reduce((x, pm) => x + pm.amount, 0);
  b.payments.push({ id: 'p' + Date.now(), amount, method, ref, date });
  settleBills(b);
  openPaymentModal(id);
  renderCalendar();
  const extra = amount - Math.max(dueBefore, 0);
  showToast(extra > 0 ? '💵' : '✓', extra > 0 ? `Payment recorded · $ ${extra.toLocaleString()} remaining to return` : 'Payment recorded', 'success');
}

function autoMarkPaid(id) {
  const b = bookings.find(x => x.id === id);
  const due = b.bills.reduce((s, bl) => s + bl.amount, 0) - b.payments.reduce((s, p) => s + p.amount, 0);
  if (due > 0) b.payments.push({ id: 'p' + Date.now(), amount: due, method: 'Cash', ref: 'Settled in full', date: toDateStr(new Date()) });
  settleBills(b);
  openPaymentModal(id);
  renderCalendar();
  showToast('✓', 'All bills marked as paid', 'success');
}

function deletePayment(bookingId, payId) {
  const b = bookings.find(bk => bk.id === bookingId);
  b.payments = b.payments.filter(p => p.id !== payId);
  settleBills(b);
  openPaymentModal(bookingId);
  renderCalendar();
}

// INVOICE
function openInvoiceModal(id) {
  hideContextMenu();
  const b = bookings.find(bk => bk.id === id);
  const room = ROOM_TYPES.flatMap(t => t.rooms.map(r => ({ ...r, type: t.name }))).find(r => r.num === b.roomNum);
  const cin  = new Date(b.checkIn);
  const cout = new Date(b.checkOut);
  const nights     = Math.round((cout - cin) / 86400000);
  const totalBills = b.bills.reduce((s, bl) => s + bl.amount, 0);
  const totalPaid  = b.payments.reduce((s, p) => s + p.amount, 0);
  const balance    = totalBills - totalPaid;
  const invNum     = 'INV-' + b.id.toUpperCase() + '-' + new Date().getFullYear();
  const billRows   = b.bills.map(bl => `<tr>
    <td>${bl.date}</td><td>${bl.desc}${billBy(bl) ? `<div class="bill-by">👤 Ordered by ${escH(billBy(bl))}</div>` : ''}</td>
    <td style="text-align:right;font-weight:600">$ ${bl.amount.toLocaleString()}</td>
    <td><span class="badge ${bl.paid ? 'badge-paid' : 'badge-unpaid'}">${bl.paid ? '✓ Paid' : 'Unpaid'}</span></td>
  </tr>`).join('');
  const payRows = b.payments.map(p => `<tr>
    <td>${p.date}</td><td>${p.method} · ${p.ref}</td>
    <td style="text-align:right;color:var(--success);font-weight:600">$ ${p.amount.toLocaleString()}</td><td></td>
  </tr>`).join('');

  openModal(`<div class="modal invoice-modal">
    <div class="inv-hero">
      <div class="inv-hero-top">
        <div class="inv-brand">
          <span class="brand-logo inv-logo"><img src="../assets/logo-dark-sm.png" alt=""></span>
          <div>
            <div class="inv-hotel-name">Dyafa Hotel</div>
            <div class="inv-tagline">Pyramids &amp; Spa · Giza, Egypt</div>
            <div class="inv-tagline" style="margin-top:3px;font-size:9px;letter-spacing:0.08em">${HOTEL.address}</div>
            <div class="inv-tagline" style="margin-top:2px;font-size:9px;letter-spacing:0.08em">${HOTEL.phone1} · ${HOTEL.phone2} · ${HOTEL.email}</div>
          </div>
        </div>
        <div class="inv-meta">
          <div class="inv-num-label">Invoice</div>
          <div class="inv-num-val">${invNum}</div>
          <div class="inv-date">Issued ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
      </div>
      <div class="inv-divider"></div>
    </div>
    <div class="inv-section">
      <div class="inv-section-title">Guest Information</div>
      <div class="inv-grid">
        <div><div class="inv-field-label">Full Name</div><div class="inv-field-value">${b.guestName}</div></div>
        <div><div class="inv-field-label">Nationality</div><div class="inv-field-value">${b.nationality || '—'}</div></div>
        <div><div class="inv-field-label">ID / Passport</div><div class="inv-field-value">${b.idNumber || '—'}</div></div>
        <div><div class="inv-field-label">Phone</div><div class="inv-field-value">${b.phone || '—'}</div></div>
        <div><div class="inv-field-label">Email</div><div class="inv-field-value">${b.email || '—'}</div></div>
        <div><div class="inv-field-label">Guests</div><div class="inv-field-value">${b.adults} Adult(s), ${b.children} Child(ren)</div></div>
      </div>
    </div>
    <div class="inv-section">
      <div class="inv-section-title">Room & Stay Details</div>
      <div class="inv-grid">
        <div><div class="inv-field-label">Room</div><div class="inv-field-value">${b.roomNum} — ${room ? room.type : '—'}</div></div>
        <div><div class="inv-field-label">Duration</div><div class="inv-field-value">${nights} Night${nights !== 1 ? 's' : ''}</div></div>
        <div><div class="inv-field-label">Check-In</div><div class="inv-field-value">${cin.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'long', year:'numeric' })}</div></div>
        <div><div class="inv-field-label">Check-Out</div><div class="inv-field-value">${cout.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'long', year:'numeric' })}</div></div>
        <div><div class="inv-field-label">Status</div><div class="inv-field-value">
          <span class="badge ${b.status === 'checked-in' ? 'badge-in' : b.status === 'pending' ? 'badge-pending' : 'badge-out'}">${b.status}</span>
        </div></div>
        ${b.notes ? `<div><div class="inv-field-label">Notes</div><div class="inv-field-value" style="font-size:11px">${b.notes}</div></div>` : ''}
      </div>
    </div>
    <div class="inv-section">
      <div class="inv-section-title">Charges & Payments</div>
      <table class="items-table">
        <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${billRows || '<tr><td colspan="4" style="color:var(--text-3);text-align:center;padding:16px">No charges recorded</td></tr>'}
          ${b.payments.length ? `<tr><td colspan="4" style="padding:6px 12px;background:var(--surface2);font-size:9px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-3)">Payments Received</td></tr>${payRows}` : ''}
        </tbody>
      </table>
      <div class="summary-box" style="max-width:280px;margin-left:auto">
        <div class="summary-row"><span>Subtotal</span><span style="font-weight:600">$ ${totalBills.toLocaleString()}</span></div>
        <div class="summary-row"><span style="color:var(--success)">Payments</span><span style="color:var(--success);font-weight:600">− $ ${totalPaid.toLocaleString()}</span></div>
        <div class="summary-row total"><span>Balance Due</span>
          <span style="color:${balance <= 0 ? 'var(--success)' : 'var(--danger)'}">
            ${balance <= 0 ? '✓ SETTLED' : '$ ' + balance.toLocaleString()}
          </span>
        </div>
        ${remainingRow(balance)}
      </div>
    </div>
    <div style="padding:16px 28px;font-size:11px;color:var(--text-3);text-align:center;font-style:italic;border-top:1px solid var(--border)">
      Thank you for choosing Dyafa Hotel Pyramids &amp; Spa. We look forward to welcoming you again.
    </div>
    <div class="modal-footer" id="invPrintBar">
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="printInvoice('${b.id}')">Print / Save PDF</button>
    </div>
  </div>`);
}

const HOTEL = {
  name: 'Dyafa Hotel Pyramids & Spa',
  address: '59 Abo Elhol Elsiahy, ElMansorya – Nazlet Elsemman, Giza, Egypt',
  phone1: '+20 115 452 3544',
  phone2: '+20 2 3386 5731',
  email: 'dyafapyramidshotel@gmail.com'
};

/* Builds a clean, light, A4 invoice in a hidden frame and opens the print dialog
   (choose "Save as PDF" there). Independent of the dark/light dashboard theme. */
function printInvoice(id) {
  const b = bookings.find(bk => bk.id === id);
  if (!b) return;
  const room = ROOM_TYPES.flatMap(t => t.rooms.map(r => ({ ...r, type: t.name }))).find(r => r.num === b.roomNum);
  const cin = new Date(b.checkIn), cout = new Date(b.checkOut);
  const nights = Math.max(1, Math.round((cout - cin) / 86400000));
  const totalBills = b.bills.reduce((x, bl) => x + bl.amount, 0);
  const totalPaid  = b.payments.reduce((x, p) => x + p.amount, 0);
  const balance = totalBills - totalPaid;
  const invNum = 'INV-' + String(b.id).toUpperCase() + '-' + new Date().getFullYear();
  const fmt = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const money = n => '$ ' + Number(n).toLocaleString('en-US');
  const logo = new URL('../assets/logo-light.png', location.href).href;
  const statusLabel = b.status === 'checked-in' ? 'Checked In' : b.status === 'pending' ? 'Reserved' : 'Checked Out';
  const field = (l, v) => `<div class="f"><div class="fl">${l}</div><div class="fv">${escH(v || '—')}</div></div>`;

  const billRows = b.bills.map(bl => `<tr>
      <td>${escH(bl.date)}</td><td>${escH(bl.desc)}${billBy(bl) ? `<div class="by">Ordered by ${escH(billBy(bl))}</div>` : ''}</td>
      <td class="r">${money(bl.amount)}</td>
      <td class="c"><span class="tag ${bl.paid ? 'ok' : 'due'}">${bl.paid ? 'Paid' : 'Unpaid'}</span></td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No charges recorded</td></tr>';
  const payRows = b.payments.map(p => `<tr>
      <td>${escH(p.date)}</td><td>${escH(p.method)} · ${escH(p.ref)}</td>
      <td class="r ok-t">− ${money(p.amount)}</td><td></td></tr>`).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${invNum} — ${escH(b.guestName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page { size:A4; margin:0; }
*{ box-sizing:border-box; margin:0; padding:0; }
html,body{ background:#fff; }
body{ font-family:'Inter',Arial,sans-serif; color:#1c1a16; font-size:12px; line-height:1.45;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page{ width:210mm; min-height:297mm; padding:0 0 18mm; position:relative; }
.top{ background:#14141b; color:#f3d56b; padding:12mm 14mm 9mm; position:relative; }
.top::after{ content:''; position:absolute; left:0; right:0; bottom:0; height:3px; background:linear-gradient(90deg,#8a6a1f,#f3d56b,#8a6a1f); }
.top-row{ display:flex; justify-content:space-between; align-items:center; gap:16px; }
.brand{ display:flex; align-items:center; gap:14px; }
.logo{ width:64px; height:64px; border-radius:50%; background:#fff; border:2px solid #d4af37; padding:3px; display:grid; place-items:center; overflow:hidden; flex-shrink:0; }
.logo img{ width:100%; height:100%; object-fit:contain; }
.hn{ font-family:'Cormorant Garamond',Georgia,serif; font-size:27px; font-weight:600; letter-spacing:.03em; line-height:1.05; color:#f3d56b; }
.hs{ font-size:9px; letter-spacing:.24em; text-transform:uppercase; color:#cfc7b4; margin-top:4px; }
.inv{ text-align:right; }
.inv .t{ font-size:9px; letter-spacing:.22em; text-transform:uppercase; color:#cfc7b4; }
.inv .n{ font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; color:#f3d56b; margin:2px 0; }
.inv .d{ font-size:10px; color:#cfc7b4; }
.contact{ margin-top:7mm; display:flex; gap:18px; flex-wrap:wrap; font-size:9.5px; color:#d9d2c0; border-top:1px solid rgba(243,213,107,.25); padding-top:3.5mm; }
.body{ padding:8mm 14mm 0; }
.sec{ margin-bottom:6.5mm; break-inside:avoid; }
.st{ font-size:9px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:#8a6a1f; display:flex; align-items:center; gap:10px; margin-bottom:3.5mm; }
.st::after{ content:''; flex:1; height:1px; background:#e6dfcc; }
.grid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:3.5mm 8mm; }
.fl{ font-size:8.5px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:#8b8576; margin-bottom:1px; }
.fv{ font-size:12px; font-weight:500; color:#1c1a16; word-break:break-word; }
table{ width:100%; border-collapse:collapse; }
th{ text-align:left; font-size:8.5px; letter-spacing:.12em; text-transform:uppercase; color:#6b6454; background:#f6f1e3; padding:7px 9px; border-bottom:1.5px solid #d4af37; }
td{ padding:8px 9px; border-bottom:1px solid #eee7d6; vertical-align:top; }
tr{ break-inside:avoid; }
.r{ text-align:right; white-space:nowrap; font-weight:600; } .c{ text-align:center; }
th.r{ text-align:right; } th.c{ text-align:center; }
.sub td{ background:#faf7ee; font-size:8.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#8a6a1f; padding:6px 9px; }
.by{ font-size:9.5px; color:#8a6a1f; font-weight:600; margin-top:2px; }
.empty{ text-align:center; color:#8b8576; padding:14px; }
.tag{ display:inline-block; font-size:9px; font-weight:700; padding:2px 8px; border-radius:20px; border:1px solid; }
.tag.ok{ color:#157347; background:#e6f5ec; border-color:#b5e0c6; } .tag.due{ color:#b42318; background:#fdeceb; border-color:#f4c1bd; }
.ok-t{ color:#157347; }
.totals{ width:78mm; margin:5mm 0 0 auto; border:1px solid #e6dfcc; border-radius:8px; overflow:hidden; break-inside:avoid; }
.tr{ display:flex; justify-content:space-between; padding:7px 12px; border-bottom:1px solid #eee7d6; font-size:12px; }
.tr.total{ background:#14141b; color:#f3d56b; font-weight:700; font-size:14px; border:none; padding:10px 12px; }
.tr.total.settled span:last-child{ color:#7ee2a8; }
.tr.rem{ background:#fff7e0; color:#8a6a1f; border-bottom:none; border-top:1px solid #f0e2b0; }
.foot{ position:absolute; left:14mm; right:14mm; bottom:9mm; border-top:1px solid #e6dfcc; padding-top:3.5mm; text-align:center; font-size:10px; color:#6b6454; }
.foot b{ font-family:'Cormorant Garamond',Georgia,serif; font-size:13px; color:#8a6a1f; font-weight:600; }
</style></head><body><div class="page">
<div class="top">
  <div class="top-row">
    <div class="brand"><div class="logo"><img src="${logo}" alt=""></div>
      <div><div class="hn">Dyafa Hotel</div><div class="hs">Pyramids &amp; Spa</div></div></div>
    <div class="inv"><div class="t">Invoice</div><div class="n">${invNum}</div><div class="d">Issued ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
  </div>
  <div class="contact"><span>${HOTEL.address}</span><span>${HOTEL.phone1}</span><span>${HOTEL.phone2}</span><span>${HOTEL.email}</span></div>
</div>
<div class="body">
  <div class="sec"><div class="st">Guest Information</div><div class="grid">
    ${field('Full Name', b.guestName)}${field('Nationality', b.nationality)}${field('ID / Passport', b.idNumber)}
    ${field('Phone', b.phone)}${field('Email', b.email)}${field('Guests', b.adults + ' Adult(s), ' + b.children + ' Child(ren)')}
  </div></div>
  <div class="sec"><div class="st">Room &amp; Stay Details</div><div class="grid">
    ${field('Room', b.roomNum + (room ? ' — ' + room.type : ''))}${field('Duration', nights + ' Night' + (nights !== 1 ? 's' : ''))}${field('Status', statusLabel)}
    ${field('Check-In', fmt(cin))}${field('Check-Out', fmt(cout))}${b.notes ? field('Notes', b.notes) : ''}
  </div></div>
  <div class="sec"><div class="st">Charges &amp; Payments</div>
    <table><thead><tr><th style="width:17%">Date</th><th>Description</th><th class="r" style="width:20%">Amount</th><th class="c" style="width:13%">Status</th></tr></thead>
    <tbody>${billRows}${b.payments.length ? '<tr class="sub"><td colspan="4">Payments Received</td></tr>' + payRows : ''}</tbody></table>
    <div class="totals">
      <div class="tr"><span>Subtotal</span><b>${money(totalBills)}</b></div>
      <div class="tr"><span class="ok-t">Payments</span><b class="ok-t">− ${money(totalPaid)}</b></div>
      <div class="tr total ${balance <= 0 ? 'settled' : ''}"><span>Balance Due</span><span>${balance <= 0 ? '✓ SETTLED' : money(balance)}</span></div>
      ${balance < 0 ? `<div class="tr rem"><span>Remaining (paid extra)</span><b>${money(-balance)}</b></div>` : ''}
    </div>
  </div>
</div>
<div class="foot"><b>Thank you for choosing Dyafa Hotel Pyramids &amp; Spa.</b><br>We look forward to welcoming you again.</div>
</div></body></html>`;

  const old = document.getElementById('invPrintFrame'); if (old) old.remove();
  const fr = document.createElement('iframe');
  fr.id = 'invPrintFrame';
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const doc = fr.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  let fired = false;
  const go = () => {
    if (fired) return; fired = true;
    const imgs = Array.from(doc.images);
    Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))
      .then(() => (doc.fonts && doc.fonts.ready) || 0)
      .then(() => { fr.contentWindow.focus(); fr.contentWindow.print(); })
      .catch(() => fr.contentWindow.print());
  };
  fr.onload = () => setTimeout(go, 150);
  setTimeout(go, 2500);   // fallback if fonts/onload are slow
}

// ━━━━━━━━━━━━━━━━ NAV ━━━━━━━━━━━━━━━━
function changeMonth(delta) {
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderCalendar();
  setTimeout(scrollToToday, 80);
}
function goToToday() {
  currentDate = new Date();
  renderCalendar();
  setTimeout(scrollToToday, 80);
}

// ━━━━━━━━━━━━━━━━ TOAST ━━━━━━━━━━━━━━━━
function showToast(icon, msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s, transform 0.3s';
    t.style.opacity   = '0';
    t.style.transform = 'translateY(10px)';
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

// ━━━━━━━━━━━━━━━━ THEME ━━━━━━━━━━━━━━━━
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  document.getElementById('themeIcon').textContent = isLight ? '☾' : '☀';
  localStorage.setItem('hotelTheme', isLight ? 'light' : 'dark');
}

// ━━━━━━━━━━━━━━━━ GUEST SERVICES REQUESTS ━━━━━━━━━━━━━━━━
const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const cleanTxt = s => String(s == null ? '' : s).replace(/[<>"'`&]/g, '').trim();   // text that becomes part of a booking
const normTxt = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const pendingRequests = () => DyafaStore.all().filter(r => r.status === 'pending');
const ALL_ROOMS = ROOM_TYPES.flatMap(t => t.rooms.map(r => ({ num: r.num, type: t.name })));

const openServiceOrders = () => DyafaStore.orders().filter(o => o.status === 'new' && !(o.amount > 0));
const attentionCount = () => pendingRequests().length + openServiceOrders().length;

// Guest orders -> Bills & Charges of the guest's room. EVERY order is added (unpriced ones as $ 0 so staff can set the price);
// unpriced ones also stay in the panel as service requests until marked Done.
function bookingForOrder(o) {
  let b = bookings.find(x => x.id === o.bookingId && x.status !== 'checked-out');
  if (!b && o.roomNumber) {   // booking link lost -> use whoever is in the room now
    const inHouse = bookings.filter(x => x.roomNum === String(o.roomNumber) && x.status === 'checked-in');
    b = inHouse.find(x => normTxt(x.guestName) === normTxt(o.guestName)) || inHouse[0];
  }
  return b || null;
}
function processOrders() {
  DyafaStore.orders().filter(o => o.status === 'new' && !o.billed).forEach(o => {
    const b = bookingForOrder(o);
    if (!b) return;
    // claimOrder() lets exactly ONE open dashboard turn this order into a bill (no double billing with several receptionists)
    DyafaStore.claimOrder(o.id).then(won => {
      if (!won) return;
      const amount = o.amount > 0 ? o.amount : 0;
      const rq = DyafaStore.get(o.requestId);                                   // the guest who sent the order (the name shown after "Welcome,")
      const by = cleanTxt((rq && rq.companionName) || o.guestName || '').slice(0, 120);
      b.bills.push({ id: 'bi' + Date.now() + Math.floor(Math.random() * 1000), desc: cleanTxt(o.desc).slice(0, 200) + ' (Guest Services)' + (amount ? '' : ' – price TBD'),
        amount, paid: false, date: toDateStr(new Date()), orderId: o.id, by });
      settleBills(b);
      DyafaStore.updateOrder(o.id, amount ? { status: 'billed', billed: true, bookingId: b.id } : { billed: true, bookingId: b.id });
      showToast('🍽', `${cleanTxt(o.guestName)} · Room ${cleanTxt(o.roomNumber)}: ${amount ? '$ ' + amount + ' added' : 'request added'} to Bills & Charges`, 'success');
      renderCalendar(); if (document.getElementById('reqModal')) openRequestsModal();
    });
  });
}

function updateTourBadge() {
  const b = document.getElementById('tourBadge'); if (!b) return;
  const n = DyafaStore.tours().filter(t => t.status === 'new').length;
  b.textContent = n; b.style.display = n ? 'inline-block' : 'none';
  document.getElementById('tourBtn').classList.toggle('has-req', n > 0);
}

function updateRequestBadge() {
  updateTourBadge();
  if (typeof updateSvcBadges === 'function') updateSvcBadges();
  const b = document.getElementById('reqBadge'); if (!b) return;
  const n = attentionCount();
  b.textContent = n; b.style.display = n ? 'inline-block' : 'none';
  document.getElementById('reqBtn').classList.toggle('has-req', n > 0);
}

function activeBookingsForRoom(room) {
  return bookings.filter(b => b.roomNum === room && b.status !== 'checked-out');
}

function requestCard(r) {
  const today = toDateStr(new Date());
  const tomorrow = toDateStr(new Date(Date.now() + 86400000));
  const isNew = r.type === 'new';
  const room = r.requestedRoom || '';
  const ci = r.checkIn || today, co = r.checkOut || tomorrow;
  const info = isNew
    ? `${escH(r.country)} · ${escH(r.checkIn)} → ${escH(r.checkOut)} (${escH(r.nights)}n) · ${escH(r.adults)} adult(s), ${escH(r.children)} child(ren)`
    : `Already registered · Room ${escH(r.requestedRoom)} · Registered under: <b>${escH(r.name)}</b>` + (r.companionName ? ` · Guest: <b>${escH(r.companionName)}</b>` : '');
  const opts = ALL_ROOMS.map(x => `<option value="${x.num}" ${x.num === room ? 'selected' : ''}>${x.num} — ${x.type}${activeBookingsForRoom(x.num).length ? ' (occupied/reserved)' : ''}</option>`).join('');
  return `<div class="req-card" id="rc_${r.id}">
    <div class="req-top"><div><div class="req-name">${escH(r.name)}</div><div class="req-info">${info}</div></div>
      <span class="badge badge-pending">◎ Pending</span></div>
    <div class="form-grid" style="margin-top:12px">
      <div class="form-group"><label>Assign room</label>
        <select id="rq_room_${r.id}" onchange="refreshLinkOptions('${r.id}')"><option value="">Select room…</option>${opts}</select></div>
      <div class="form-group"><label>Booking</label><select id="rq_link_${r.id}"><option value="new">Create new booking (check in now)</option></select></div>
      <div class="form-group"><label>Check-In</label><input id="rq_in_${r.id}" type="date" value="${escH(ci)}" /></div>
      <div class="form-group"><label>Check-Out</label><input id="rq_out_${r.id}" type="date" value="${escH(co)}" /></div>
    </div>
    <div class="req-actions">
      <button class="btn danger-btn" onclick="declineRequest('${r.id}')">✕ Decline</button>
      <button class="btn primary" onclick="approveRequest('${r.id}')">✓ Assign room & allow login</button>
    </div></div>`;
}

function refreshLinkOptions(rid) {
  const r = DyafaStore.get(rid); if (!r) return;
  const room = document.getElementById('rq_room_' + rid).value;
  const sel = document.getElementById('rq_link_' + rid);
  const list = room ? activeBookingsForRoom(room) : [];
  sel.innerHTML = '<option value="new">Create new booking (check in now)</option>' +
    list.map(b => `<option value="${b.id}">${escH(b.guestName)} · ${escH(b.checkIn)} → ${escH(b.checkOut)} (${b.status === 'pending' ? 'reserved' : 'in-house'})</option>`).join('');
  const match = list.find(b => normTxt(b.guestName) === normTxt(r.name));
  if (match) {
    sel.value = match.id;
    document.getElementById('rq_in_' + rid).value = match.checkIn;
    document.getElementById('rq_out_' + rid).value = match.checkOut;
  }
}

function openRequestsModal() {
  hideContextMenu();
  const pend = pendingRequests().sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  const active = DyafaStore.withAccess();
  openModal(`<div class="modal" style="width:680px" id="reqModal">
    <div class="modal-header"><div class="modal-title">Guest Services Requests</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-section">Waiting for approval (${pend.length})</div>
      ${pend.length ? pend.map(requestCard).join('') : '<div class="req-empty">No pending requests.</div>'}
      ${(() => { const so = openServiceOrders(); return so.length ? `<div class="form-section" style="margin-top:22px">Service requests (${so.length})</div>` + so.map(o => {
        const bk = bookings.find(x => x.id === o.bookingId);
        return `<div class="req-row"><div><b>${escH(o.type)}</b> · Room ${escH(o.roomNumber)} · ${escH(o.guestName)}<div class="req-info">${escH(o.desc)}</div></div>
          <div style="display:flex;gap:6px">${bk ? `<button class="btn" onclick="closeModal();openBillsModal('${bk.id}')">＋ Charge</button>` : ''}<button class="btn primary" onclick="completeServiceOrder('${o.id}')">✓ Done</button></div></div>`; }).join('') : ''; })()}
      <div class="form-section" style="margin-top:22px">Guests with access (${active.length})</div>
      ${active.length ? active.map(r => `<div class="req-row"><div><b>${escH(r.name)}</b> · Room ${escH(r.roomNumber)}${r.companionName ? ` · with ${escH(r.companionName)}` : ''}</div>
        <button class="btn danger-btn" onclick="revokeAccess('${r.id}')">Remove access</button></div>`).join('') : '<div class="req-empty">Nobody is logged in to Guest Services.</div>'}
    </div></div>`);
  pend.forEach(r => { if (r.requestedRoom) refreshLinkOptions(r.id); });
}

function approveRequest(rid) {
  const r = DyafaStore.get(rid); if (!r || r.status !== 'pending') { openRequestsModal(); return; }
  const room = document.getElementById('rq_room_' + rid).value;
  const link = document.getElementById('rq_link_' + rid).value;
  const cin  = document.getElementById('rq_in_' + rid).value;
  const cout = document.getElementById('rq_out_' + rid).value;
  if (!room) { showToast('⚠', 'Choose a room first', 'error'); return; }
  let bookingId;
  if (link === 'new') {
    if (!cin || !cout || cout <= cin) { showToast('⚠', 'Enter valid check-in / check-out dates', 'error'); return; }
    const clash = findRoomClash(room, cin, cout);
    if (clash) { showToast('⚠', clashMessage(room, clash), 'error'); return; }
    bookingId = 'b' + Date.now();
    bookings.push({ id: bookingId, roomNum: room, guestName: cleanTxt(r.name), phone: '', email: '', nationality: cleanTxt(r.country),
      idNumber: '', checkIn: cin, checkOut: cout, status: 'checked-in', adults: parseInt(r.adults) || 1, children: parseInt(r.children) || 0,
      notes: 'Created from Guest Services request' + (r.companionName ? ' | Staying with: ' + cleanTxt(r.companionName) : ''), bills: [], payments: [] });
  } else {
    const b = bookings.find(x => x.id === link); if (!b) { showToast('⚠', 'Booking not found', 'error'); return; }
    if (r.companionName && !(b.notes || '').includes(r.companionName)) b.notes = ((b.notes ? b.notes + ' | ' : '') + 'Staying with: ' + cleanTxt(r.companionName));
    if (b.status === 'pending') b.status = 'checked-in';
    bookingId = b.id;
  }
  DyafaStore.approve(rid, room, bookingId);
  renderCalendar();
  showToast('✓', `${r.name} can now log in — Room ${room}`, 'success');
  openRequestsModal();
}

function completeServiceOrder(oid) {
  DyafaStore.updateOrder(oid, { status: 'done' });
  updateRequestBadge();
  openRequestsModal();
}

function declineRequest(rid) {
  DyafaStore.reject(rid);
  updateRequestBadge();
  showToast('✕', 'Request declined', 'info');
  openRequestsModal();
}

function revokeAccess(rid) {
  if (!confirm('Remove this guest\'s Guest Services access?')) return;
  DyafaStore.update(rid, { status: 'revoked', endedAt: new Date().toISOString() });
  showToast('✓', 'Access removed', 'info');
  openRequestsModal();
}

// per-booking access (right-click a booking)
function hasGuestAccess(bookingId) {
  return DyafaStore.withAccess().some(r => r.bookingId === bookingId);
}
function addGuestAccess(bookingId) {
  hideContextMenu();
  const b = bookings.find(x => x.id === bookingId); if (!b) return;
  DyafaStore.grant(b);
  updateRequestBadge();
  showToast('🔑', `${b.guestName} can now use Guest Services (Room ${b.roomNum})`, 'success');
}
function removeGuestAccess(bookingId) {
  hideContextMenu();
  const b = bookings.find(x => x.id === bookingId); if (!b) return;
  if (!confirm(`Remove Guest Services access for ${b.guestName}?`)) return;
  DyafaStore.revoke(bookingId);
  updateRequestBadge();
  showToast('🔒', `${b.guestName} is logged out of Guest Services`, 'info');
}

// live updates: guest sends a request from the website
let _lastPending = pendingRequests().length, _lastSvc = openServiceOrders().length;
function sweepStaleAccess() {   // approved but booking gone/checked-out -> access ended, so list and guest page agree
  DyafaStore.all().filter(r => r.status === 'approved' && !DyafaStore.hasAccess(r)).forEach(r => DyafaStore.update(r.id, { status: 'revoked', endedAt: new Date().toISOString() }));
}
function onRequestsChanged() {
  sweepStaleAccess();
  processOrders();
  const n = pendingRequests().length, sv = openServiceOrders().length;
  updateRequestBadge();
  if (n > _lastPending) showToast('🛎', 'New Guest Services request', 'info');
  if (sv > _lastSvc) showToast('🛎', 'New service request from a guest', 'info');
  _lastPending = n; _lastSvc = sv;
  if (document.getElementById('reqModal')) openRequestsModal();
}
DyafaStore.onChange(onRequestsChanged);
setInterval(() => {
  if (DyafaStore.orders().some(o => o.status === 'new' && !o.billed) || pendingRequests().length !== _lastPending || openServiceOrders().length !== _lastSvc) onRequestsChanged();
}, 3000);

// ━━━━━━━━━━━━━━━━ TOUR BOOKINGS (from Guest Services) ━━━━━━━━━━━━━━━━
const TOUR_STATUS = { new: ['badge-pending', '◎ New'], confirmed: ['badge-in', '✓ Confirmed'], done: ['badge-out', 'Done'] };

function tourRow(t) {
  const [cls, label] = TOUR_STATUS[t.status] || TOUR_STATUS.new;
  const info = `${escH(t.date)} ${escH(t.time)} · ${escH(t.participants)} guest(s)` +
    (t.guide ? ` · Guide${t.guideLanguage ? ' (' + escH(t.guideLanguage) + ')' : ''}` : '');
  return `<div class="req-card" id="tb_${t.id}">
    <div class="req-top">
      <div><div class="req-name">${escH(t.tourName)}</div>
        <div class="req-info"><b>${escH(t.guestName)}</b> · Room ${escH(t.roomNumber)}</div>
        <div class="req-info">${info}</div>
        ${t.notes ? `<div class="req-info">📝 ${escH(t.notes)}</div>` : ''}</div>
      <span class="badge ${cls}">${label}</span></div>
    <div class="req-actions">
      ${t.status === 'new' ? `<button class="btn" onclick="setTourStatus('${t.id}','confirmed')">✓ Confirm</button>` : ''}
      ${t.status === 'confirmed' ? `<button class="btn" onclick="setTourStatus('${t.id}','done')">✓ Mark done</button>` : ''}
      <button class="btn" onclick="openTourEdit('${t.id}')">✏️ Edit</button>
      <button class="btn danger-btn" onclick="deleteTour('${t.id}')">🗑 Delete</button>
    </div></div>`;
}

function openToursModal() {
  hideContextMenu();
  const list = DyafaStore.tours().slice().sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1);
  openModal(`<div class="modal" style="width:680px" id="tourModal">
    <div class="modal-header"><div class="modal-title">Tour Bookings (${list.length})</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">${list.length ? list.map(tourRow).join('') : '<div class="req-empty">No tour bookings yet.</div>'}</div></div>`);
}

function setTourStatus(id, status) {
  DyafaStore.updateTour(id, { status });
  updateTourBadge(); openToursModal();
}

function deleteTour(id) {
  const t = DyafaStore.tours().find(x => x.id === id); if (!t) return;
  if (!confirm(`Delete the tour booking for ${t.guestName} (${t.tourName})?`)) return;
  DyafaStore.removeTour(id);
  updateTourBadge(); showToast('🗑', 'Tour booking deleted', 'info'); openToursModal();
}

function openTourEdit(id) {
  const t = DyafaStore.tours().find(x => x.id === id); if (!t) return;
  const langs = ['English','Arabic','French','German','Spanish','Italian','Chinese','Japanese'];
  openModal(`<div class="modal" style="width:560px" id="tourEditModal">
    <div class="modal-header"><div class="modal-title">Edit Tour Booking</div><button class="modal-close" onclick="openToursModal()">✕</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="form-group"><label>Guest name</label><input id="te_name" value="${escH(t.guestName)}" /></div>
      <div class="form-group"><label>Room</label><input id="te_room" value="${escH(t.roomNumber)}" /></div>
      <div class="form-group"><label>Tour</label><input id="te_tour" value="${escH(t.tourName)}" /></div>
      <div class="form-group"><label>Participants</label><input id="te_part" type="number" min="1" value="${escH(t.participants)}" /></div>
      <div class="form-group"><label>Date</label><input id="te_date" type="date" value="${escH(t.date)}" /></div>
      <div class="form-group"><label>Time</label><input id="te_time" type="time" value="${escH(t.time)}" /></div>
      <div class="form-group"><label>Guide</label><select id="te_guide"><option value="0" ${t.guide ? '' : 'selected'}>Not required</option><option value="1" ${t.guide ? 'selected' : ''}>Required</option></select></div>
      <div class="form-group"><label>Guide language</label><select id="te_lang"><option value="">—</option>${langs.map(l => `<option ${l === t.guideLanguage ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="form-group"><label>Status</label><select id="te_status">${Object.keys(TOUR_STATUS).map(k => `<option value="${k}" ${k === (t.status || 'new') ? 'selected' : ''}>${TOUR_STATUS[k][1]}</option>`).join('')}</select></div>
    </div>
    <div class="form-group" style="margin-top:12px"><label>Notes</label><textarea id="te_notes" rows="3">${escH(t.notes)}</textarea></div>
    <div class="req-actions"><button class="btn" onclick="openToursModal()">Cancel</button><button class="btn primary" onclick="saveTourEdit('${id}')">Save Changes</button></div>
    </div></div>`);
}

function saveTourEdit(id) {
  const v = k => document.getElementById('te_' + k).value;
  const name = cleanTxt(v('name')), room = cleanTxt(v('room')), tour = cleanTxt(v('tour'));
  if (!name || !room || !tour || !v('date') || !v('time')) { showToast('⚠', 'Name, room, tour, date and time are required', 'error'); return; }
  DyafaStore.updateTour(id, {
    guestName: name, roomNumber: room, tourName: tour, participants: Math.max(1, parseInt(v('part')) || 1),
    date: v('date'), time: v('time'), guide: v('guide') === '1', guideLanguage: v('guide') === '1' ? v('lang') : '',
    status: v('status'), notes: cleanTxt(v('notes'))
  });
  updateTourBadge(); showToast('✓', 'Tour booking updated', 'success'); openToursModal();
}

// live updates: new tour booking from the website
let _lastTours = DyafaStore.tours().length;
function onToursChanged() {
  const n = DyafaStore.tours().length;
  updateTourBadge();
  if (n > _lastTours) showToast('🗺', 'New tour booking from a guest', 'info');
  _lastTours = n;
  if (document.getElementById('tourModal')) openToursModal();
}
DyafaStore.onChange(onToursChanged);
setInterval(() => { if (DyafaStore.tours().length !== _lastTours) onToursChanged(); }, 3000);


// ━━━━━━━━━━━━━━━━ FOOD / LAUNDRY / HOUSEKEEPING (from Guest Services) ━━━━━━━━━━━━━━━━
const SVC_TYPES = {
  food:         { type: 'Food Order',   title: 'Food Orders',           icon: '🍽', empty: 'No food orders yet.' },
  laundry:      { type: 'Laundry',      title: 'Laundry Requests',      icon: '🧺', empty: 'No laundry requests yet.' },
  housekeeping: { type: 'Housekeeping', title: 'Housekeeping Requests', icon: '🧹', empty: 'No housekeeping requests yet.' }
};
const svcOrders = k => DyafaStore.orders().filter(o => o.type === SVC_TYPES[k].type);
const svcIsOpen = o => o.status !== 'done' && !o.served;

function updateSvcBadges() {
  Object.keys(SVC_TYPES).forEach(k => {
    const b = document.getElementById(k + 'Badge'); if (!b) return;
    const n = svcOrders(k).filter(svcIsOpen).length;
    b.textContent = n; b.style.display = n ? 'inline-block' : 'none';
    document.getElementById(k + 'Btn').classList.toggle('has-req', n > 0);
  });
}

function svcRow(o, k) {
  const open = svcIsOpen(o);
  const when = o.createdAt ? new Date(o.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `<div class="req-card">
    <div class="req-top">
      <div><div class="req-name">Room ${escH(o.roomNumber)} · ${escH(o.guestName)}</div>
        <div class="req-info">${escH(o.desc)}</div>
        ${o.amount > 0 ? `<div class="req-info">💰 $ ${escH(o.amount)}</div>` : ''}
        <div class="req-info">${escH(when)}</div></div>
      <span class="badge ${open ? 'badge-pending' : 'badge-out'}">${open ? '◎ New' : 'Done'}</span></div>
    <div class="req-actions">
      ${open ? `<button class="btn primary" onclick="completeSvc('${k}','${o.id}')">✓ Done</button>` : ''}
      <button class="btn danger-btn" onclick="deleteSvc('${k}','${o.id}')">🗑 Delete</button>
    </div></div>`;
}

function openSvcModal(k) {
  hideContextMenu();
  const c = SVC_TYPES[k];
  const list = svcOrders(k).slice().sort((a, b) => (svcIsOpen(b) - svcIsOpen(a)) || ((b.createdAt || '') < (a.createdAt || '') ? -1 : 1));
  openModal(`<div class="modal" style="width:680px" id="svcModal" data-kind="${k}">
    <div class="modal-header"><div class="modal-title">${c.icon} ${c.title} (${list.length})</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">${list.length ? list.map(o => svcRow(o, k)).join('') : `<div class="req-empty">${c.empty}</div>`}</div></div>`);
}

function completeSvc(k, id) {
  DyafaStore.updateOrder(id, { served: true, status: 'done' });
  updateSvcBadges(); updateRequestBadge(); openSvcModal(k);
}

function deleteSvc(k, id) {
  if (!confirm('Delete this request from the list? (Any bill already added to the room is not removed.)')) return;
  DyafaStore.removeOrder(id);
  updateSvcBadges(); updateRequestBadge(); openSvcModal(k);
}

let _lastSvcCount = DyafaStore.orders().length;
function onSvcOrdersChanged() {
  const n = DyafaStore.orders().length;
  updateSvcBadges();
  if (n > _lastSvcCount) {
    const last = DyafaStore.orders()[n - 1];
    const k = Object.keys(SVC_TYPES).find(x => SVC_TYPES[x].type === (last && last.type));
    if (k) showToast(SVC_TYPES[k].icon, 'New ' + SVC_TYPES[k].title.toLowerCase().replace(/s$/, '') + ' from a guest', 'info');
  }
  _lastSvcCount = n;
  const m = document.getElementById('svcModal'); if (m) openSvcModal(m.dataset.kind);
}
DyafaStore.onChange(onSvcOrdersChanged);
setInterval(() => { if (DyafaStore.orders().length !== _lastSvcCount) onSvcOrdersChanged(); }, 3000);

// ━━━━━━━━━━━━━━━━ INIT ━━━━━━━━━━━━━━━━
DyafaStore.onBookingsChange(() => { renderCalendar(); if (document.getElementById('reqModal')) openRequestsModal(); });   // a booking changed on another device
DyafaStore.onError(msg => showToast('⚠', 'Could not save to the server – check the internet connection. (' + msg + ')', 'error'));
renderCalendar();
updateSvcBadges();
sweepStaleAccess();
processOrders();
if (localStorage.getItem('hotelTheme') === 'light') {
  document.documentElement.classList.add('light');
  document.getElementById('themeIcon').textContent = '☾';
}
setTimeout(scrollToToday, 150);
document.getElementById('calendarWrapper').addEventListener('scroll', function () {
  const h = document.getElementById('pastHint');
  if (h) h.style.opacity = this.scrollLeft > 10 ? '1' : '0';
});

// Keep the calendar exactly as tall as the free screen space (nav bar height can change with window width)
function syncLayoutVars() {
  const nav = document.querySelector('.month-nav');
  if (nav) document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
}
syncLayoutVars();
window.addEventListener('resize', syncLayoutVars);
if (window.ResizeObserver) { const _n = document.querySelector('.month-nav'); if (_n) new ResizeObserver(syncLayoutVars).observe(_n); }


// ━━━━━━━━━━━━━━━━ GRIDLINES: ONE MENU (all / vertical only / horizontal only / none) ━━━━━━━━━━━━━━━━
const GRID_LABELS = { all: 'All lines', v: 'Vertical only', h: 'Horizontal only', none: 'No lines' };
function currentGridMode() {
  const r = document.documentElement.classList;
  const offV = r.contains('no-grid-v'), offH = r.contains('no-grid-h');
  return offV && offH ? 'none' : offV ? 'h' : offH ? 'v' : 'all';
}
function syncGridMenu() {
  const mode = currentGridMode();
  const lb = document.getElementById('gridMenuLabel'); if (lb) lb.textContent = 'Grid: ' + GRID_LABELS[mode];
  const btn = document.getElementById('gridMenuBtn'); if (btn) btn.classList.toggle('is-off', mode !== 'all');
  document.querySelectorAll('#gridPop [data-mode]').forEach(b => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on));
  });
}
function setGridMode(mode) {
  const root = document.documentElement;
  const hideV = mode === 'h' || mode === 'none';      // vertical lines hidden
  const hideH = mode === 'v' || mode === 'none';      // horizontal lines hidden
  root.classList.toggle('no-grid-v', hideV);
  root.classList.toggle('no-grid-h', hideH);
  try { localStorage.setItem('hotelGridV', hideV ? 'off' : 'on'); localStorage.setItem('hotelGridH', hideH ? 'off' : 'on'); } catch (e) {}
  syncGridMenu(); closeGridMenu();
}
function closeGridMenu() {
  const p = document.getElementById('gridPop'), b = document.getElementById('gridMenuBtn');
  if (p) p.hidden = true; if (b) b.setAttribute('aria-expanded', 'false');
}
function toggleGridMenu(e) {
  if (e) e.stopPropagation();
  const p = document.getElementById('gridPop'), b = document.getElementById('gridMenuBtn'); if (!p) return;
  p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden));
}
document.addEventListener('click', e => { if (!e.target.closest('#gridMenu')) closeGridMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGridMenu(); });
syncGridMenu();
