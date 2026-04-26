/**
 * Admin Dashboard Script
 */

const API_BASE_URL = '/api/v1';
let currentUser = null;
let currentPage = 'users';

document.addEventListener('DOMContentLoaded', async () => {
    // Проверить аутентификацию
    if (!localStorage.getItem('access_token')) {
        window.location.href = 'login.html';
        return;
    }

    // Загрузить информацию пользователя
    await loadUserProfile();

    // Проверить права администратора
    if (!currentUser.roles || !currentUser.roles.includes('admin')) {
        alert('У вас нет прав доступа к этой странице');
        window.location.href = 'index.html';
        return;
    }

    // Установить обработчики событий
    setupEventListeners();

    // Загрузить начальные данные
    await loadDashboardData();
});

async function loadUserProfile() {
    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = 'login.html';
                return;
            }
            throw new Error('Ошибка загрузки профиля');
        }

        currentUser = await response.json();
        document.getElementById('username').textContent = currentUser.username;

    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

function setupEventListeners() {
    // Переключение между секциями
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', handleMenuItemClick);
    });

    // Кнопка выхода
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Кнопки управления
    document.getElementById('addUserBtn')?.addEventListener('click', () => showUserForm());
    document.getElementById('addRoleBtn')?.addEventListener('click', () => showRoleForm());
    document.getElementById('addLabelBtn')?.addEventListener('click', () => showLabelForm());

    // Поиск и фильтры
    document.getElementById('userSearchBtn')?.addEventListener('click', () => loadUsers());
    document.getElementById('permissionFilterBtn')?.addEventListener('click', () => loadPermissions());
    document.getElementById('logFilterBtn')?.addEventListener('click', () => loadLogs());

    // Закрытие модального окна
    document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
}

function handleMenuItemClick(e) {
    e.preventDefault();
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    this.classList.add('active');
    
    const sectionId = this.getAttribute('data-section');
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.add('active');
        currentPage = sectionId;
    }
}

async function loadDashboardData() {
    try {
        const token = localStorage.getItem('access_token');

        // Загрузить статистику
        const [usersResponse, rolesResponse, permissionsResponse, labelsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/admin/users?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/admin/roles?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/admin/permissions?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/admin/labels?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (usersResponse.ok) {
            const data = await usersResponse.json();
            document.getElementById('userCount').textContent = data.total || 0;
        }

        if (rolesResponse.ok) {
            const data = await rolesResponse.json();
            document.getElementById('roleCount').textContent = data.total || 0;
        }

        if (permissionsResponse.ok) {
            const data = await permissionsResponse.json();
            document.getElementById('permissionCount').textContent = data.total || 0;
        }

        if (labelsResponse.ok) {
            const data = await labelsResponse.json();
            document.getElementById('labelCount').textContent = data.total || 0;
        }

        // Загрузить начальные данные
        await Promise.all([
            loadUsers(),
            loadRoles(),
            loadPermissions(),
            loadLabels(),
            loadLogs()
        ]);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadUsers(offset = 0, limit = 20) {
    try {
        const token = localStorage.getItem('access_token');
        const search = document.getElementById('userSearch')?.value || '';
        const statusFilter = document.getElementById('userStatusFilter')?.value || '';

        let url = `${API_BASE_URL}/admin/users?limit=${limit}&offset=${offset}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (statusFilter) url += `&is_active=${statusFilter === 'active'}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Ошибка загрузки пользователей');

        const data = await response.json();
        const tbody = document.getElementById('usersTable');
        tbody.innerHTML = '';

        if (data.items && data.items.length > 0) {
            data.items.forEach(user => {
                const row = document.createElement('tr');
                const roles = (user.roles || []).join(', ') || 'Нет';
                const status = user.is_active ? '<span class="status-badge status-active">Активный</span>' : '<span class="status-badge status-inactive">Неактивный</span>';
                
                row.innerHTML = `
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.email}</td>
                    <td>${roles}</td>
                    <td>${status}</td>
                    <td>${new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon btn-icon-view" onclick="viewUser(${user.id})">👁️</button>
                            <button class="btn-icon btn-icon-edit" onclick="editUser(${user.id})">✏️</button>
                            <button class="btn-icon btn-icon-delete" onclick="deleteUser(${user.id})">🗑️</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Пользователи не найдены</td></tr>';
        }

        // Пагинация
        renderPagination('usersPagination', data.total, offset, limit, (newOffset) => loadUsers(newOffset, limit));

    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function loadRoles(offset = 0, limit = 20) {
    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/admin/roles?limit=${limit}&offset=${offset}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Ошибка загрузки ролей');

        const data = await response.json();
        const tbody = document.getElementById('rolesTable');
        tbody.innerHTML = '';

        if (data.items && data.items.length > 0) {
            data.items.forEach(role => {
                const row = document.createElement('tr');
                const permissions = (role.permissions || []).join(', ') || 'Нет';
                const isSystem = role.is_system ? '<span class="status-badge status-system">Да</span>' : 'Нет';
                
                row.innerHTML = `
                    <td>${role.id}</td>
                    <td>${role.name}</td>
                    <td>${role.description || '-'}</td>
                    <td>${isSystem}</td>
                    <td><small>${permissions}</small></td>
                    <td>
                        <div class="action-buttons">
                            ${!role.is_system ? `
                                <button class="btn-icon btn-icon-edit" onclick="editRole(${role.id})">✏️</button>
                                <button class="btn-icon btn-icon-delete" onclick="deleteRole(${role.id})">🗑️</button>
                            ` : ''}
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Роли не найдены</td></tr>';
        }

        renderPagination('rolesPagination', data.total, offset, limit, (newOffset) => loadRoles(newOffset, limit));

    } catch (error) {
        console.error('Error loading roles:', error);
    }
}

async function loadPermissions(offset = 0, limit = 50) {
    try {
        const token = localStorage.getItem('access_token');
        const category = document.getElementById('permissionCategory')?.value || '';

        let url = `${API_BASE_URL}/admin/permissions?limit=${limit}&offset=${offset}`;
        if (category) url += `&category=${encodeURIComponent(category)}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Ошибка загрузки разрешений');

        const data = await response.json();
        const tbody = document.getElementById('permissionsTable');
        tbody.innerHTML = '';

        if (data.items && data.items.length > 0) {
            data.items.forEach(perm => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${perm.id}</td>
                    <td>${perm.name}</td>
                    <td>${perm.description || '-'}</td>
                    <td><small>${perm.category || '-'}</small></td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Разрешения не найдены</td></tr>';
        }

        renderPagination('permissionsPagination', data.total, offset, limit, (newOffset) => loadPermissions(newOffset, limit));

    } catch (error) {
        console.error('Error loading permissions:', error);
    }
}

async function loadLabels(offset = 0, limit = 20) {
    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/admin/labels?limit=${limit}&offset=${offset}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Ошибка загрузки меток');

        const data = await response.json();
        const tbody = document.getElementById('labelsTable');
        tbody.innerHTML = '';

        if (data.items && data.items.length > 0) {
            data.items.forEach(label => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${label.id}</td>
                    <td>${label.name}</td>
                    <td>${label.description || '-'}</td>
                    <td><span style="background: ${label.color}; padding: 4px 8px; border-radius: 3px; color: white;">${label.color}</span></td>
                    <td>${label.created_by}</td>
                    <td>${new Date(label.created_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon btn-icon-edit" onclick="editLabel(${label.id})">✏️</button>
                            <button class="btn-icon btn-icon-delete" onclick="deleteLabel(${label.id})">🗑️</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Метки не найдены</td></tr>';
        }

        renderPagination('labelsPagination', data.total, offset, limit, (newOffset) => loadLabels(newOffset, limit));

    } catch (error) {
        console.error('Error loading labels:', error);
    }
}

async function loadLogs(offset = 0, limit = 30) {
    try {
        const token = localStorage.getItem('access_token');
        const userId = document.getElementById('logUserIdFilter')?.value || '';
        const action = document.getElementById('logActionFilter')?.value || '';
        const status = document.getElementById('logStatusFilter')?.value || '';

        let url = `${API_BASE_URL}/admin/logs?limit=${limit}&offset=${offset}`;
        if (userId) url += `&user_id=${encodeURIComponent(userId)}`;
        if (action) url += `&action=${encodeURIComponent(action)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Ошибка загрузки логов');

        const data = await response.json();
        const tbody = document.getElementById('logsTable');
        tbody.innerHTML = '';

        if (data.items && data.items.length > 0) {
            data.items.forEach(log => {
                const row = document.createElement('tr');
                const statusClass = log.status === 'success' ? 'status-success' : 'status-error';
                const statusText = log.status === 'success' ? '✓ Успешно' : '✗ Ошибка';
                
                row.innerHTML = `
                    <td>${log.id}</td>
                    <td>${log.user_id}</td>
                    <td>${log.action}</td>
                    <td>${log.resource_type} #${log.resource_id}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${new Date(log.created_at).toLocaleString('ru-RU')}</td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Логи не найдены</td></tr>';
        }

        renderPagination('logsPagination', data.total, offset, limit, (newOffset) => loadLogs(newOffset, limit));

    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

function renderPagination(containerId, total, currentOffset, limit, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const pageCount = Math.ceil(total / limit);
    const currentPage = Math.floor(currentOffset / limit) + 1;

    if (currentPage > 1) {
        const btn = document.createElement('button');
        btn.textContent = '← Назад';
        btn.addEventListener('click', () => callback(currentOffset - limit));
        container.appendChild(btn);
    }

    for (let i = 1; i <= pageCount; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        if (i === currentPage) btn.classList.add('active');
        btn.addEventListener('click', () => callback((i - 1) * limit));
        container.appendChild(btn);
    }

    if (currentPage < pageCount) {
        const btn = document.createElement('button');
        btn.textContent = 'Далее →';
        btn.addEventListener('click', () => callback(currentOffset + limit));
        container.appendChild(btn);
    }
}

function showUserForm(userId = null) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    if (userId) {
        modalTitle.textContent = 'Редактировать пользователя';
    } else {
        modalTitle.textContent = 'Добавить пользователя';
    }

    // Форма будет разработана позже
    modalBody.innerHTML = '<p>Функция будет добавлена позже</p>';
    modal.style.display = 'flex';
}

function showRoleForm(roleId = null) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    if (roleId) {
        modalTitle.textContent = 'Редактировать роль';
    } else {
        modalTitle.textContent = 'Создать роль';
    }

    modalBody.innerHTML = '<p>Функция будет добавлена позже</p>';
    modal.style.display = 'flex';
}

function showLabelForm(labelId = null) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    if (labelId) {
        modalTitle.textContent = 'Редактировать метку';
    } else {
        modalTitle.textContent = 'Создать метку';
    }

    modalBody.innerHTML = '<p>Функция будет добавлена позже</p>';
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

async function viewUser(userId) {
    console.log('View user:', userId);
}

async function editUser(userId) {
    console.log('Edit user:', userId);
}

async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    console.log('Delete user:', userId);
}

async function editRole(roleId) {
    console.log('Edit role:', roleId);
}

async function deleteRole(roleId) {
    if (!confirm('Вы уверены, что хотите удалить эту роль?')) return;
    console.log('Delete role:', roleId);
}

async function editLabel(labelId) {
    console.log('Edit label:', labelId);
}

async function deleteLabel(labelId) {
    if (!confirm('Вы уверены, что хотите удалить эту метку?')) return;
    console.log('Delete label:', labelId);
}

async function handleLogout() {
    if (!confirm('Вы уверены, что хотите выйти?')) return;

    try {
        const token = localStorage.getItem('access_token');
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    localStorage.removeItem('access_token');
    localStorage.removeItem('token_type');
    localStorage.removeItem('user');

    window.location.href = 'login.html';
}
