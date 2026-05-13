/* =====================================================
   Rivtara Kanban — vanilla JS (no React, no build tools)
   ===================================================== */

// ── Constants ──────────────────────────────────────────
const USER_PASSWORD = 'frame2026';
const ADMIN_PASSWORD = 'admin2026';
const STATUSES = ['todo', 'inProgress', 'review', 'done'];
const STATUS_LABELS = {
  todo: 'To Do',
  inProgress: 'In Progress',
  review: 'Review',
  done: 'Done',
};
const NEXT_STATUS = {
  todo: 'inProgress',
  inProgress: 'review',
  review: 'done',
};

// Icons
const ICON = {
  trash: '🗑️',
  forward: '→',
  alert: '⚠️',
};

// ── State ──────────────────────────────────────────────
let state = {
  authView: 'user', // 'user' | 'admin'
  currentUser: null,
  boards: [],
  selectedBoardId: null,
  activeTaskFormStatus: null,
  pendingTaskStatus: null,
  priorityFilter: 'all',
  assigneeFilter: 'all',
  searchQuery: '',
  assignees: [], // CENTRALIZED ASSIGNEE STATE
  activityLog: [], // ACTIVITY TRACKING
};

// ── Drag state ─────────────────────────────────────────
let drag = { taskId: null, fromStatus: null };
let editingTask = null;

// ══════════════════════════════════════════════════════
//  localStorage helpers
// ══════════════════════════════════════════════════════
function loadBoards() {
  try {
    const raw = localStorage.getItem('kanban_boards');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBoards() {
  try {
    localStorage.setItem('kanban_boards', JSON.stringify(state.boards));
  } catch {}
}

function loadUser() {
  try {
    const raw = localStorage.getItem('current_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  try {
    localStorage.setItem('current_user', JSON.stringify(user));
  } catch {}
}

function clearUser() {
  try {
    localStorage.removeItem('current_user');
  } catch {}
}

// ── Assignee persistence ────────────────────────────────
function loadAssignees() {
  try {
    const raw = localStorage.getItem('kanban_assignees');
    return raw ? JSON.parse(raw) : ['Aki', 'Mukul', 'Samkit', 'Kanak', 'Others'];
  } catch {
    return ['Aki', 'Mukul', 'Samkit', 'Kanak', 'Others'];
  }
}

function saveAssignees() {
  try {
    localStorage.setItem('kanban_assignees', JSON.stringify(state.assignees));
  } catch {}
}

// FIX #2: Case-insensitive assignee helpers
// Normalise to Title Case for display, compare lowercase
function normalizeAssigneeName(name) {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function assigneeExists(name) {
  const lower = name.trim().toLowerCase();
  return state.assignees.some((a) => a.toLowerCase() === lower);
}

function getCanonicalAssignee(name) {
  const lower = name.trim().toLowerCase();
  return state.assignees.find((a) => a.toLowerCase() === lower) || null;
}

// ══════════════════════════════════════════════════════
//  Auth
// ══════════════════════════════════════════════════════
function switchAuthTab(tab) {
  state.authView = tab;
  document
    .getElementById('tab-user')
    .classList.toggle('active', tab === 'user');
  document
    .getElementById('tab-admin')
    .classList.toggle('active', tab === 'admin');
  document.getElementById('form-user').style.display =
    tab === 'user' ? 'flex' : 'none';
  document.getElementById('form-admin').style.display =
    tab === 'admin' ? 'flex' : 'none';
}

function handleUserLogin() {
  const pw = document.getElementById('user-password').value;
  if (pw === USER_PASSWORD) {
    loginAs({ name: 'User', role: 'user', login: new Date().toLocaleString() });
  } else {
    alert('Invalid password');
  }
}

function handleAdminLogin() {
  const pw = document.getElementById('admin-password').value;
  if (pw === ADMIN_PASSWORD) {
    loginAs({
      name: 'Admin',
      role: 'admin',
      login: new Date().toLocaleString(),
    });
  } else {
    alert('Invalid admin password');
  }
}

function loginAs(user) {
  state.currentUser = user;
  saveUser(user);
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  renderDashboard();
}

function handleLogout() {
  state.currentUser = null;
  state.selectedBoardId = null;
  clearUser();
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('user-password').value = '';
  document.getElementById('admin-password').value = '';
  switchAuthTab('user');
}

// ══════════════════════════════════════════════════════
//  Board operations
// ══════════════════════════════════════════════════════
function createBoard() {
  const nameEl = document.getElementById('new-board-name');
  const name = nameEl.value.trim();
  if (!name) return;
  const board = {
    id: Date.now(),
    name,
    createdBy: state.currentUser.name,
    createdAt: new Date().toLocaleString(),
    tasks: { todo: [], inProgress: [], review: [], done: [] },
  };
  state.boards.push(board);
  state.selectedBoardId = board.id;
  saveBoards();
  closeNewBoardModal();
  renderDashboard();
}

function deleteBoard(boardId) {
  if (state.currentUser.role !== 'admin') {
    alert('Only admins can delete boards');
    return;
  }
  if (!confirm('Delete this board and all its tasks? This cannot be undone.'))
    return;
  state.boards = state.boards.filter((b) => b.id !== boardId);
  if (state.selectedBoardId === boardId) state.selectedBoardId = null;
  saveBoards();
  renderDashboard();
}

function editBoardName() {
  const board = getBoard();
  if (!board) return;

  const newName = prompt('Enter new board name:', board.name);
  if (!newName) return;

  board.name = newName.trim();
  saveBoards();
  renderDashboard();
}

function selectBoard(boardId) {
  state.selectedBoardId = boardId;
  state.activeTaskFormStatus = null;
  renderDashboard();
}

// ══════════════════════════════════════════════════════
//  Task operations
// ══════════════════════════════════════════════════════
function getBoard() {
  return state.boards.find((b) => b.id === state.selectedBoardId) || null;
}

function openTaskModal(status) {
  state.pendingTaskStatus = status;
  currentAssignee = '';
  currentDueDate = '';
  currentSubtasks = [];
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-priority-select').value = 'medium';
  document.getElementById('task-due-date-input').value = '';
  document.getElementById('task-subtasks-count').value = '';
  document.getElementById('task-subtasks-container').style.display = 'none';
  document.getElementById('assignee-text').textContent = 'Assign to...';
  document.getElementById('task-assignee-input').value = '';
  document.getElementById('assignee-display').style.display = 'flex';
  document.getElementById('task-assignee-input').style.display = 'none';
  document.getElementById('assignee-suggestions').style.display = 'none';
  document.getElementById('task-submit-btn').textContent = 'Add Task';
  document.getElementById('modal-task-form').style.display = 'flex';
  editingTask = null;
  setTimeout(() => document.getElementById('task-title-input').focus(), 50);
}

function closeTaskModalFn() {
  document.getElementById('modal-task-form').style.display = 'none';
  state.pendingTaskStatus = null;
  editingTask = null;
}

function closeTaskModal(e) {
  if (e.target === document.getElementById('modal-task-form'))
    closeTaskModalFn();
}

function editTask(taskId, status) {
  const board = getBoard();
  if (!board) return;

  const task = board.tasks[status].find((t) => t.id === taskId);
  if (!task) return;

  editingTask = {
    taskId,
    status,
  };

  currentAssignee = task.assignee;
  currentDueDate = task.dueDate || '';
  currentSubtasks = task.subtasks ? [...task.subtasks] : [];
  state.pendingTaskStatus = status;
  document.getElementById('task-title-input').value = task.title;
  document.getElementById('task-desc-input').value = task.description || '';
  document.getElementById('task-priority-select').value = task.priority;
  document.getElementById('task-due-date-input').value = currentDueDate;
  document.getElementById('task-subtasks-count').value = currentSubtasks.length;
  // FIX #4: always call handler so subtask fields render
  handleSubtaskCountChange(currentSubtasks.length);
  document.getElementById('assignee-text').textContent = task.assignee || 'Assign to...';
  document.getElementById('task-assignee-input').value = '';
  document.getElementById('assignee-display').style.display = 'flex';
  document.getElementById('task-assignee-input').style.display = 'none';
  document.getElementById('assignee-suggestions').style.display = 'none';
  document.getElementById('task-submit-btn').textContent = 'Save Changes';
  document.getElementById('modal-task-form').style.display = 'flex';
}

function submitTask() {
  const status = state.pendingTaskStatus;
  if (!status || !state.selectedBoardId) return;
  const title = document.getElementById('task-title-input').value.trim();
  if (!title) {
    alert('Task title is required');
    return;
  }

  const board = getBoard();
  if (!board) return;

  currentDueDate = document.getElementById('task-due-date-input').value;

  // Collect subtask values from inputs at submit time
  const subtaskInputs = document.querySelectorAll('#subtasks-list .subtask-input');
  currentSubtasks = Array.from(subtaskInputs).map((el) => el.value);

  // EDIT EXISTING TASK
  if (editingTask) {
    const task = board.tasks[editingTask.status].find(
      (t) => t.id === editingTask.taskId
    );
    if (!task) return;

    const changes = [];
    if (task.title !== title) changes.push(`title`);
    if (task.priority !== document.getElementById('task-priority-select').value) changes.push(`priority`);
    if (task.assignee !== (currentAssignee || 'Unassigned')) changes.push(`assignee`);
    if (task.dueDate !== currentDueDate) changes.push(`due date`);

    task.title = title;
    task.description = document.getElementById('task-desc-input').value.trim();
    task.priority = document.getElementById('task-priority-select').value;
    task.assignee = currentAssignee || 'Unassigned';
    task.dueDate = currentDueDate;
    task.subtasks = currentSubtasks.filter((s) => s.trim());

    if (changes.length > 0) {
      addActivity(editingTask.taskId, board.id, 'updated', `Changed: ${changes.join(', ')}`);
    }

    saveBoards();
    editingTask = null;
    closeTaskModalFn();
    renderBoard(board);
    return;
  }

  const task = {
    id: Date.now(),
    title,
    description: document.getElementById('task-desc-input').value.trim(),
    priority: document.getElementById('task-priority-select').value,
    assignee: currentAssignee || 'Unassigned',
    dueDate: currentDueDate,
    subtasks: currentSubtasks.filter((s) => s.trim()),
    status,
    createdAt: new Date().toLocaleString(),
    createdBy: state.currentUser.name,
  };

  board.tasks[status].push(task);
  addActivity(task.id, board.id, 'created', `Created in ${STATUS_LABELS[status]}`);
  
  saveBoards();
  closeTaskModalFn();
  renderBoard(board);
}

function deleteTask(taskId, status) {
  if (!confirm('Delete this task?')) return;
  const board = getBoard();
  if (!board || !board.tasks[status]) return;
  board.tasks[status] = board.tasks[status].filter((t) => t.id !== taskId);
  saveBoards();
  renderBoard(board);
}

function moveTask(taskId, fromStatus) {
  const toStatus = NEXT_STATUS[fromStatus];
  if (!toStatus) return;
  const board = getBoard();
  if (!board) return;
  const task = board.tasks[fromStatus].find((t) => t.id === taskId);
  if (!task) return;
  board.tasks[fromStatus] = board.tasks[fromStatus].filter(
    (t) => t.id !== taskId
  );
  board.tasks[toStatus].push(task);
  
  addActivity(taskId, board.id, 'moved', `Moved to ${STATUS_LABELS[toStatus]}`);
  
  saveBoards();
  renderBoard(board);
}

// ══════════════════════════════════════════════════════
//  Assignee operations
// ══════════════════════════════════════════════════════
let currentAssignee = '';
let currentDueDate = '';
let currentSubtasks = [];

let assigneeDropdownOpen = false;

function toggleAssigneeInput() {
  const display = document.getElementById('assignee-display');
  const input = document.getElementById('task-assignee-input');
  const suggestions = document.getElementById('assignee-suggestions');

  assigneeDropdownOpen = true;

  display.style.display = 'none';
  input.style.display = 'block';

  // Pre-fill with current assignee so user can see/edit it
  input.value = currentAssignee || '';

  filterAssigneeList(input.value);

  // Prevent the suggestions container from stealing focus (causes blur on input)
  // This is the key fix: pointerdown on the list calls preventDefault before blur fires
  suggestions.onmousedown = (e) => e.preventDefault();

  requestAnimationFrame(() => {
    input.focus();
  });

  suggestions.style.display = 'block';
}

function closeAssigneeDropdown() {
  const display = document.getElementById('assignee-display');
  const input = document.getElementById('task-assignee-input');
  const suggestions = document.getElementById('assignee-suggestions');

  assigneeDropdownOpen = false;

  input.style.display = 'none';
  suggestions.style.display = 'none';
  display.style.display = 'flex';
}

function filterAssigneeList(query) {
  const suggestions = document.getElementById('assignee-suggestions');
  const lowerQuery = query.toLowerCase().trim();

  suggestions.innerHTML = '';

  const list = lowerQuery
    ? state.assignees.filter((a) => a.toLowerCase().includes(lowerQuery))
    : state.assignees.slice();

  list.forEach((assignee) => {
    const div = document.createElement('div');
    div.className = 'assignee-suggestion-item';
    div.textContent = assignee;
    div.addEventListener('click', () => {
      selectAssignee(assignee);
    });
    suggestions.appendChild(div);
  });

  const hasExact = assigneeExists(lowerQuery);
  if (lowerQuery && !hasExact) {
    const newDiv = document.createElement('div');
    newDiv.className = 'assignee-suggestion-item new-item';
    newDiv.textContent = `+ Add "${query}"`;
    newDiv.addEventListener('click', () => {
      addNewAssigneeAndSelect(query);
    });
    suggestions.appendChild(newDiv);
  }

  suggestions.style.display = suggestions.children.length > 0 ? 'block' : 'none';
}

function selectAssignee(name) {
  currentAssignee = name;

  const text = document.getElementById('assignee-text');
  if (text) text.textContent = name;

  const input = document.getElementById('task-assignee-input');
  if (input) input.value = '';

  closeAssigneeDropdown();
}

function confirmAssignee() {
  const input = document.getElementById('task-assignee-input');
  if (!input || input.style.display === 'none') return;

  const value = input.value.trim();

  if (!value) {
    if (!currentAssignee) {
      document.getElementById('assignee-text').textContent = 'Assign to...';
    }
    closeAssigneeDropdown();
    return;
  }

  const canonical = getCanonicalAssignee(value);
  if (canonical) {
    selectAssignee(canonical);
    return;
  }

  addNewAssigneeAndSelect(value);
}

function addNewAssigneeAndSelect(name) {
  // FIX #2: normalize casing and check case-insensitively
  const normalized = normalizeAssigneeName(name);
  if (!normalized) return;
  if (assigneeExists(normalized)) {
    // Use the existing canonical version
    const canonical = getCanonicalAssignee(normalized);
    selectAssignee(canonical);
    return;
  }

  state.assignees.push(normalized);
  saveAssignees();
  updateNavbarAssigneeFilter();
  selectAssignee(normalized);
}

function updateNavbarAssigneeFilter() {
  const input = document.getElementById('navbar-assignee-input');

  if (!input) return;

  if (
    state.assigneeFilter &&
    state.assigneeFilter !== 'all'
  ) {
    input.value = state.assigneeFilter;
  } else {
    input.value = '';
  }
}
function removeNavbarAssignee(name) {
  if (state.currentUser?.role !== 'admin') return;

  const confirmed = confirm(`Remove ${name}?`);

  if (!confirmed) return;

  state.assignees = state.assignees.filter(
    (a) => a !== name
  );

  saveAssignees();

  if (state.assigneeFilter === name) {
    state.assigneeFilter = 'all';

    const input = document.getElementById('navbar-assignee-input');

    if (input) input.value = '';
  }

  filterNavbarAssignees(
    document.getElementById('navbar-assignee-input')?.value || ''
  );

  renderDashboard();
}
function filterNavbarAssignees(query) {
  const suggestions = document.getElementById('navbar-assignee-suggestions');
  if (!suggestions) return;

  const lower = query.toLowerCase().trim();

  const filtered = state.assignees.filter((a) =>
    a.toLowerCase().includes(lower)
  );

  suggestions.innerHTML = '';

  filtered.forEach((assignee) => {
    const item = document.createElement('div');
    item.className = 'navbar-assignee-item';

    const isAdmin = state.currentUser?.role === 'admin';

    item.innerHTML = `
      <span>${assignee}</span>

      ${
        isAdmin
          ? `<button
              class="navbar-assignee-remove"
              onclick="event.stopPropagation(); removeNavbarAssignee('${assignee}')">
              ×
            </button>`
          : ''
      }
    `;

    item.addEventListener('click', () => {
      setAssigneeFilter(assignee);

      document.getElementById('navbar-assignee-input').value = assignee;

      suggestions.style.display = 'none';
    });

    suggestions.appendChild(item);
  });

  suggestions.style.display = filtered.length ? 'block' : 'none';
}
// ── Subtask handling ────────────────────────────────────
// FIX #4: attach oninput event properly and trigger instantly
function handleSubtaskCountChange(value) {
  const count = parseInt(value) || 0;
  const container = document.getElementById('task-subtasks-container');
  const list = document.getElementById('subtasks-list');

  if (count === 0) {
    container.style.display = 'none';
    currentSubtasks = [];
    list.innerHTML = '';
    return;
  }

  // Preserve existing values, expand/shrink array
  const prev = currentSubtasks.slice();
  currentSubtasks = Array.from({ length: count }, (_, i) => prev[i] || '');

  container.style.display = 'block';
  list.innerHTML = '';

  currentSubtasks.forEach((val, i) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'subtask-input';
    input.placeholder = `Subtask ${i + 1}`;
    input.value = val;
    input.addEventListener('input', function () {
      currentSubtasks[i] = this.value;
    });
    list.appendChild(input);
  });
}

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const diff = due - today;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function renderDueDate(daysUntil) {
  if (daysUntil === null) return '';
  if (daysUntil < 0) {
    return `<span class="due-date-badge overdue">${Math.abs(daysUntil)}d overdue</span>`;
  } else if (daysUntil === 0) {
    return `<span class="due-date-badge due-soon">Due today</span>`;
  } else if (daysUntil <= 3) {
    return `<span class="due-date-badge due-soon">Due in ${daysUntil}d</span>`;
  } else {
    return `<span class="due-date-badge">Due in ${daysUntil}d</span>`;
  }
}

// ── Theme toggle ────────────────────────────────────────
function toggleTheme() {
  const body = document.body;
  const isDark = !body.classList.contains('light-mode');
  
  if (isDark) {
    body.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  } else {
    body.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  }
}

// ── Activity Log ─────────────────────────────────────────
function addActivity(taskId, boardId, action, details = '') {
  const activity = {
    id: Date.now(),
    taskId,
    boardId,
    action, // 'created', 'updated', 'moved', 'assigned'
    details,
    actor: state.currentUser?.name || 'Unknown',
    timestamp: new Date().toISOString(),
  };

  if (!state.activityLog) state.activityLog = [];
  state.activityLog.push(activity);
  saveActivityLog();
}

function saveActivityLog() {
  try {
    localStorage.setItem('kanban_activity', JSON.stringify(state.activityLog || []));
  } catch {}
}

function loadActivityLog() {
  try {
    const raw = localStorage.getItem('kanban_activity');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getTaskActivity(taskId, boardId) {
  return (state.activityLog || []).filter(
    (a) => a.taskId === taskId && a.boardId === boardId
  );
}

function formatActivityTimestamp(isoString) {
  const date = new Date(isoString);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderActivityLog(taskId, boardId) {
  const activities = getTaskActivity(taskId, boardId);
  
  if (activities.length === 0) {
    return '<div style="color: #64748b; font-size: 12px; padding: 10px;">No activity yet</div>';
  }

  return `
    <div class="activity-log">
      ${activities
        .map(
          (a) => `
        <div class="activity-item ${a.action}">
          <div>
            <span class="activity-actor">${escHtml(a.actor)}</span>
            <span class="activity-action">${escHtml(a.action)}</span>
            ${a.details ? `<span class="activity-detail">${escHtml(a.details)}</span>` : ''}
          </div>
          <div class="activity-timestamp">${formatActivityTimestamp(a.timestamp)}</div>
        </div>`
        )
        .join('')}
    </div>`;
}

function showTaskInfo(taskId, status) {
  const board = getBoard();
  if (!board) return;

  const task = board.tasks[status].find((t) => t.id === taskId);
  if (!task) return;

  const content = document.getElementById('task-info-content');
  const activityHtml = renderActivityLog(taskId, board.id);

  content.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h3 style="color: #f1f5f9; margin-bottom: 12px; font-size: 14px; font-weight: 600;">
        ${escHtml(task.title)}
      </h3>
      
      <div class="task-info-row">
        <span class="task-info-label">Created by</span>
        <span class="task-info-value">${escHtml(task.createdBy)}</span>
      </div>
      
      <div class="task-info-row">
        <span class="task-info-label">Created at</span>
        <span class="task-info-value">${escHtml(task.createdAt)}</span>
      </div>
      
      <div class="task-info-row">
        <span class="task-info-label">Assigned to</span>
        <span class="task-info-value">${escHtml(task.assignee)}</span>
      </div>
      
      <div class="task-info-row">
        <span class="task-info-label">Priority</span>
        <span class="task-info-value">${escHtml(task.priority)}</span>
      </div>
      
      ${task.dueDate ? `
        <div class="task-info-row">
          <span class="task-info-label">Due date</span>
          <span class="task-info-value">${escHtml(task.dueDate)}</span>
        </div>
      ` : ''}
      
      <div class="task-info-row">
        <span class="task-info-label">Status</span>
        <span class="task-info-value">${escHtml(STATUS_LABELS[status])}</span>
      </div>
      
      ${task.subtasks?.length > 0 ? `
        <div class="task-info-row">
          <span class="task-info-label">Subtasks</span>
          <span class="task-info-value">${task.subtasks.length}</span>
        </div>
      ` : ''}
    </div>
    
    <div style="border-top: 1px solid rgba(148, 163, 184, 0.1); padding-top: 12px;">
      <h4 style="color: #cbd5e1; margin-bottom: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
        Activity Log
      </h4>
      ${activityHtml}
    </div>`;

  document.getElementById('modal-task-info').style.display = 'flex';
}

function closeTaskInfoModal(e) {
  if (!e || e.target === document.getElementById('modal-task-info')) {
    document.getElementById('modal-task-info').style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════
//  Drag and drop
// ══════════════════════════════════════════════════════
function onDragStart(e, taskId, status) {
  drag.taskId = taskId;
  drag.fromStatus = status;
  e.target.classList.add('dragging');
}

function onDragEnd(e) {
  e.target.classList.remove('dragging');
  drag = { taskId: null, fromStatus: null };
}

function onDragOver(e, status) {
  e.preventDefault();
  document.getElementById(`col-${status}`).classList.add('drag-over');
}

function onDragLeave(e, status) {
  if (e.target.id === `col-${status}`) {
    document.getElementById(`col-${status}`).classList.remove('drag-over');
  }
}

function onDrop(e, toStatus) {
  e.preventDefault();
  document.getElementById(`col-${toStatus}`).classList.remove('drag-over');

  if (!drag.taskId || !drag.fromStatus) return;

  const board = getBoard();
  if (!board) return;

  const task = board.tasks[drag.fromStatus].find((t) => t.id === drag.taskId);
  if (!task) return;

  board.tasks[drag.fromStatus] = board.tasks[drag.fromStatus].filter(
    (t) => t.id !== drag.taskId
  );
  board.tasks[toStatus].push(task);

  saveBoards();
  renderBoard(board);
  drag = { taskId: null, fromStatus: null };
}

// ══════════════════════════════════════════════════════
//  Modals
// ══════════════════════════════════════════════════════
function openNewBoardModal() {
  document.getElementById('modal-new-board').style.display = 'flex';
  document.getElementById('new-board-name').focus();
}

function closeNewBoardModal() {
  document.getElementById('modal-new-board').style.display = 'none';
  document.getElementById('new-board-name').value = '';
}

function closeBoardModal(e) {
  if (e.target === document.getElementById('modal-new-board')) {
    closeNewBoardModal();
  }
}

// ══════════════════════════════════════════════════════
//  Rendering
// ══════════════════════════════════════════════════════
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTaskCard(task, status) {
  const hasNext = !!NEXT_STATUS[status];
  const daysUntil = getDaysUntil(task.dueDate);
  const dueDateHtml = renderDueDate(daysUntil);
  const subtaskCount = task.subtasks?.length || 0;
  const subtasksHtml = subtaskCount > 0 ? `<span class="subtasks-badge">${subtaskCount} tasks</span>` : '';

  return `
    <div class="task-card"
         draggable="true"
         id="task-${task.id}"
         ondragstart="onDragStart(event, ${task.id}, '${status}')"
         ondragend="onDragEnd(event)">
      <div class="task-title">${escHtml(task.title)}</div>
    ${
  task.description
    ? `<div class="task-desc">${escHtml(task.description)}</div>`
    : ''
}

${
  task.subtasks?.length
    ? `
    <div class="task-subtasks-preview">
      ${task.subtasks
        .map(
          (s) => `
          <div class="task-subtask-item">
            • ${escHtml(s)}
          </div>`
        )
        .join('')}
    </div>`
    : ''
}
      <div class="task-footer">
        <div class="task-meta">
          <span class="priority-badge priority-${task.priority}">${escHtml(
    task.priority
  )}</span>
          <span class="assignee-tag">${escHtml(task.assignee)}</span>
          ${dueDateHtml}
          ${subtasksHtml}
        </div>
        <div class="task-actions">
          <button class="task-action-btn info"
            onclick="showTaskInfo(${task.id}, '${status}')"
            title="Task details">
            ℹ️
          </button>
          <button class="task-action-btn"
            onclick="editTask(${task.id}, '${status}')"
            title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
  </svg>
          </button>
          ${
            hasNext
              ? `
            <button class="task-action-btn"
              onclick="moveTask(${task.id}, '${status}')"
              title="Move to ${STATUS_LABELS[NEXT_STATUS[status]]}">
              ${ICON.forward}
            </button>`
              : ''
          }
          <button class="task-action-btn delete"
            onclick="deleteTask(${task.id}, '${status}')"
            title="Delete">
            ${ICON.trash}
          </button>
        </div>
      </div>
    </div>`;
}

function renderColumn(status, tasks) {
  const filteredTasks = (tasks || []).filter((t) => {
    const priorityMatch =
      state.priorityFilter === 'all' || t.priority === state.priorityFilter;
    const assigneeMatch =
  state.assigneeFilter === 'all' ||
  (t.assignee || '').trim().toLowerCase() ===
  state.assigneeFilter.trim().toLowerCase();
    const searchMatch =
      !state.searchQuery ||
      t.title.toLowerCase().includes(state.searchQuery) ||
      (t.description || '').toLowerCase().includes(state.searchQuery);

    return priorityMatch && assigneeMatch && searchMatch;
  });

  const cards = filteredTasks.map((t) => renderTaskCard(t, status)).join('');

  return `
    <div class="column" id="col-${status}"
         ondragover="onDragOver(event, '${status}')"
         ondrop="onDrop(event, '${status}')">
      <div class="column-header">
        <span class="column-title">${STATUS_LABELS[status]}</span>
        <span class="column-count">${(tasks || []).length}</span>
      </div>
      <div class="tasks-list">
        ${cards || '<div class="empty-state">No tasks yet</div>'}
      </div>
      <button class="add-task-btn" onclick="openTaskModal('${status}')">
        ＋ Add Task
      </button>
    </div>`;
}

function renderBoard(board) {
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const content = document.getElementById('board-content');
  content.innerHTML = `
    <div class="board-header">
      <div>
        <div
          class="board-title"
          onclick="editBoardName()"
          title="Edit Board Name">
          ${escHtml(board.name)}
        </div>
        <div class="board-meta">Created by ${escHtml(
          board.createdBy
        )} · ${escHtml(board.createdAt)}</div>
      </div>
      ${
        isAdmin
          ? `
        <div class="board-actions">
          <button class="action-btn" onclick="deleteBoard(${board.id})">
            ${ICON.trash} Delete Board
          </button>
        </div>`
          : ''
      }
    </div>
    <div class="kanban-grid">
      ${STATUSES.map((s) => renderColumn(s, board.tasks[s])).join('')}
    </div>`;
}

function renderBoardSelector() {
  const sel = document.getElementById('board-selector');
  let html = state.boards
    .map(
      (b) => `
    <button class="board-btn ${state.selectedBoardId === b.id ? 'active' : ''}"
            onclick="selectBoard(${b.id})">
      ${escHtml(b.name)}
    </button>`
    )
    .join('');
  html += `<button class="board-btn new-btn" onclick="openNewBoardModal()">+ New Board</button>`;
  sel.innerHTML = html;
}

function setPriorityFilter(value) {
  state.priorityFilter = value;
  renderDashboard();
}

function setAssigneeFilter(value) {
  state.assigneeFilter = value;
  renderDashboard();
}

function toggleSearchBar() {
  document.getElementById('search-box').classList.toggle('active');
}

function searchTasks(value) {
  state.searchQuery = value.toLowerCase();
  renderDashboard();
}

function renderDashboard() {
  const u = state.currentUser;
  if (!u) return;

  const badge = document.getElementById('user-badge-label');
  badge.className = 'user-badge' + (u.role === 'admin' ? ' admin-badge' : '');
  badge.innerHTML =
    (u.role === 'admin' ? '🔐 ' : '') +
    escHtml(u.name) +
    ' · ' +
    u.role.toUpperCase();

  renderBoardSelector();
  updateNavbarAssigneeFilter();

  const board = getBoard();
  const content = document.getElementById('board-content');
  if (board) {
    renderBoard(board);
    updateNavbarAssigneeFilter();
  } else {
    content.innerHTML = `
      <div class="no-board-state">
        <div class="icon">${ICON.alert}</div>
        <div class="title">No board selected</div>
        <div class="sub">Create or select a board to get started</div>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════
//  Keyboard shortcuts
// ══════════════════════════════════════════════════════
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeNewBoardModal();
    closeTaskModalFn();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    const modal = document.getElementById('modal-task-form');
    if (
      modal.style.display !== 'none' &&
      document.activeElement !== document.getElementById('task-desc-input') &&
      document.activeElement !== document.getElementById('task-assignee-input')
    ) {
      submitTask();
    }
  }
});

// FIX #4: wire subtask count input via event listener after DOM ready
document.addEventListener('DOMContentLoaded', function () {
  const subtaskCountInput = document.getElementById('task-subtasks-count');
  if (subtaskCountInput) {
    subtaskCountInput.addEventListener('input', function () {
      handleSubtaskCountChange(this.value);
    });
  }

  // Assignee input blur: only fires when clicking truly outside (suggestions prevent it via onmousedown)
  const assigneeInput = document.getElementById('task-assignee-input');
  if (assigneeInput) {
    assigneeInput.addEventListener('blur', confirmAssignee);
  }
});

// ══════════════════════════════════════════════════════
//  Import/Export
// ══════════════════════════════════════════════════════
function importBoards(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const importedBoards = JSON.parse(e.target.result);
      if (!Array.isArray(importedBoards)) {
        alert('Invalid backup file');
        return;
      }
      state.boards = importedBoards;
      saveBoards();
      renderDashboard();
      alert('Boards imported successfully');
    } catch {
      alert('Import failed');
    }
  };
  reader.readAsText(file);
}

function exportBoards() {
  const data = JSON.stringify(state.boards, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rivtara-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════
//  Boot
// ══════════════════════════════════════════════════════
(function init() {
  // Load theme preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
  }

  state.boards = loadBoards();
  state.assignees = loadAssignees();
  state.activityLog = loadActivityLog();
  const savedUser = loadUser();

  if (savedUser) {
    state.currentUser = savedUser;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    updateNavbarAssigneeFilter();
    renderDashboard();
  }
   })();
document.addEventListener('mousedown', (e) => {
  const wrapper = document.querySelector('.assignee-input-wrapper');
  if (!wrapper) return;
  if (!wrapper.contains(e.target)) {
    closeAssigneeDropdown();
  }
});
document.addEventListener('click', (e) => {
  const wrapper = document.querySelector('.navbar-assignee-search');
  const suggestions = document.getElementById('navbar-assignee-suggestions');

  if (!wrapper || !suggestions) return;

  if (!wrapper.contains(e.target)) {
    suggestions.style.display = 'none';
  }
});
