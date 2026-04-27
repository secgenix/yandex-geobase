/**
 * Admin Dashboard Script
 */

const API_BASE_URL = '/api/v1';
let currentUser = null;
let currentPage = 'users';
let adminRolesCache = [];
let adminPermissionsCache = [];

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
    document.getElementById('addOrganizationBtn')?.addEventListener('click', () => showOrganizationForm());
    document.getElementById('addCategoryBtn')?.addEventListener('click', () => showCategoryForm());
    document.getElementById('activateUsersBtn')?.addEventListener('click', () => bulkUpdateUsers(true));
    document.getElementById('deactivateUsersBtn')?.addEventListener('click', () => bulkUpdateUsers(false));
    document.getElementById('exportUsersBtn')?.addEventListener('click', exportUsers);
    document.getElementById('selectAllUsers')?.addEventListener('change', (event) => {
        document.querySelectorAll('.user-select').forEach(input => input.checked = event.target.checked);
    });

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

    if (sectionId === 'manage-labels') {
        loadOrganizations();
    }
    if (sectionId === 'manage-roles') {
        loadRoles();
    }
    if (sectionId === 'manage-categories') {
        loadCategories();
    }
}

async function loadDashboardData() {
    try {
        const token = localStorage.getItem('access_token');

        // Загрузить статистику
        const [usersResponse, rolesResponse, permissionsResponse, organizationsResponse, categoriesResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/admin/users?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/admin/roles?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/admin/permissions?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/admin/organizations?limit=1&offset=0`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/admin/categories?limit=1&offset=0`, { headers: { 'Authorization': `Bearer ${token}` } })
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

        if (organizationsResponse.ok) {
            const data = await organizationsResponse.json();
            document.getElementById('labelCount').textContent = data.total || 0;
        }

        if (categoriesResponse.ok) {
            const data = await categoriesResponse.json();
            document.getElementById('categoryCount').textContent = data.total || 0;
        }

        // Загрузить начальные данные
        await Promise.all([
            loadUsers(),
            loadRoles(),
            loadPermissions(),
            loadOrganizations(),
            loadCategories(),
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
                const roles = escapeHtml((user.roles || []).join(', ') || 'Нет');
                const status = user.is_active ? '<span class="status-badge status-active">Активный</span>' : '<span class="status-badge status-inactive">Неактивный</span>';
                
                row.innerHTML = `
                    <td><input type="checkbox" class="user-select" value="${user.id}"></td>
                    <td>${user.id}</td>
                    <td>${escapeHtml(user.username)}</td>
                    <td>${escapeHtml(user.email)}</td>
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
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Пользователи не найдены</td></tr>';
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
        adminRolesCache = data.items || [];
        const tbody = document.getElementById('rolesTable');
        tbody.innerHTML = '';

        if (data.items && data.items.length > 0) {
            data.items.forEach(role => {
                const row = document.createElement('tr');
                const permissions = escapeHtml((role.permissions || []).join(', ') || 'Нет');
                const isSystem = role.is_system ? '<span class="status-badge status-system">Да</span>' : 'Нет';
                
                row.innerHTML = `
                    <td>${role.id}</td>
                    <td>${escapeHtml(role.name)}</td>
                    <td>${escapeHtml(role.description || '-')}</td>
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
        if (!category && offset === 0) adminPermissionsCache = data.items || [];
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

async function loadOrganizations(offset = 0, limit = 50) {
    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/admin/organizations?limit=${limit}&offset=${offset}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Ошибка загрузки организаций (HTTP ${response.status})`);

        const data = await response.json();
        const tbody = document.getElementById('organizationsTable');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.items && data.items.length > 0) {
            data.items.forEach(organization => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${organization.id}</td>
                    <td>${escapeHtml(organization.name)}</td>
                    <td>${escapeHtml(organization.description || '-')}</td>
                    <td>${renderColor(organization.color)}</td>
                    <td>${organization.created_at ? new Date(organization.created_at).toLocaleString('ru-RU') : '-'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon btn-icon-edit" onclick="editOrganization(${organization.id})">✏️</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Организации не найдены</td></tr>';
        }

        renderPagination(
            'organizationsPagination',
            data.total || 0,
            offset,
            limit,
            (newOffset) => loadOrganizations(newOffset, limit)
        );
    } catch (error) {
        console.error('Error loading organizations:', error);
        const tbody = document.getElementById('organizationsTable');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">Ошибка загрузки: ${String(error?.message || error)}</td></tr>`;
        }
    }
}

async function loadCategories(offset = 0, limit = 50) {
    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/admin/categories?limit=${limit}&offset=${offset}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Ошибка загрузки категорий (HTTP ${response.status})`);

        const data = await response.json();
        const tbody = document.getElementById('categoriesTable');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.items && data.items.length > 0) {
            data.items.forEach(category => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${category.id}</td>
                    <td>${escapeHtml(category.name)}</td>
                    <td>${escapeHtml(category.description || '-')}</td>
                    <td>${renderColor(category.color)}</td>
                    <td>${escapeHtml(category.icon || '-')}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon btn-icon-edit" onclick="editCategory(${category.id})">✏️</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Категории не найдены</td></tr>';
        }

        renderPagination('categoriesPagination', data.total || 0, offset, limit, (newOffset) => loadCategories(newOffset, limit));
    } catch (error) {
        console.error('Error loading categories:', error);
        const tbody = document.getElementById('categoriesTable');
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center">Ошибка загрузки: ${String(error?.message || error)}</td></tr>`;
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

async function ensureAdminDictionaries() {
    const token = localStorage.getItem('access_token');
    const [rolesResponse, permissionsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/roles?limit=1000`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/permissions?limit=1000`, { headers: { 'Authorization': `Bearer ${token}` } })
    ]);
    if (!rolesResponse.ok || !permissionsResponse.ok) throw new Error('Ошибка загрузки ролей или прав');
    adminRolesCache = (await rolesResponse.json()).items || [];
    adminPermissionsCache = (await permissionsResponse.json()).items || [];
}

async function showUserForm(userId = null) {
    await ensureAdminDictionaries();
    const user = userId ? await fetchAdminObject(`/admin/users/${userId}`) : null;
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = userId ? 'Редактировать пользователя' : 'Добавить пользователя';
    modalBody.innerHTML = `
        <form id="userForm">
            <div id="temporaryPasswordBox" class="temporary-password-box" style="display:none;"></div>
            <div class="form-row">
                <div class="form-group">
                    <label for="userUsername">Username</label>
                    <input id="userUsername" required minlength="3" maxlength="100" ${userId ? 'disabled' : ''} value="${escapeAttribute(user?.username || '')}">
                </div>
                <div class="form-group">
                    <label for="userEmail">Email</label>
                    <input id="userEmail" type="email" required value="${escapeAttribute(user?.email || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="userFirstName">Имя</label>
                    <input id="userFirstName" maxlength="100" value="${escapeAttribute(user?.first_name || '')}">
                </div>
                <div class="form-group">
                    <label for="userLastName">Фамилия</label>
                    <input id="userLastName" maxlength="100" value="${escapeAttribute(user?.last_name || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="userPassword">${userId ? 'Новый пароль' : 'Пароль'}</label>
                    <input id="userPassword" type="password" minlength="8" placeholder="${userId ? 'Оставьте пустым без изменений' : 'Пусто = временный пароль'}">
                </div>
                <div class="form-group">
                    <label>Статус</label>
                    <div class="checkbox-group">
                        <label class="checkbox-item"><input type="checkbox" id="userIsActive" ${!user || user.is_active ? 'checked' : ''}> Активен</label>
                        <label class="checkbox-item"><input type="checkbox" id="userIsVerified" ${user?.is_verified ? 'checked' : ''}> Подтверждён</label>
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label>Роли пользователя</label>
                <div class="permission-checklist">
                    ${adminRolesCache.map(role => `
                        <label class="checkbox-item">
                            <input type="checkbox" class="user-role-checkbox" value="${role.id}" ${(user?.roles || []).includes(role.name) ? 'checked' : ''}>
                            ${escapeHtml(role.name)}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">${userId ? 'Сохранить' : 'Создать'}</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>
            </div>
        </form>
    `;

    document.getElementById('userForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveUser(userId);
    });
    modal.style.display = 'flex';
}

async function showRoleForm(roleId = null) {
    await ensureAdminDictionaries();
    const role = roleId ? adminRolesCache.find(item => item.id === roleId) : null;
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = roleId ? 'Редактировать роль и права' : 'Создать роль';
    const groupedPermissions = adminPermissionsCache.reduce((acc, permission) => {
        const category = permission.category || 'other';
        acc[category] = acc[category] || [];
        acc[category].push(permission);
        return acc;
    }, {});

    modalBody.innerHTML = `
        <form id="roleForm">
            <div class="form-group">
                <label for="roleName">Название роли</label>
                <input id="roleName" required minlength="3" maxlength="100" value="${escapeAttribute(role?.name || '')}" ${role?.is_system ? 'disabled' : ''}>
            </div>
            <div class="form-group">
                <label for="roleDescription">Описание</label>
                <textarea id="roleDescription">${escapeHtml(role?.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Области доступа и CRUD-разрешения</label>
                <div class="permission-checklist">
                    ${Object.entries(groupedPermissions).map(([category, permissions]) => `
                        <div>
                            <strong>${escapeHtml(category)}</strong>
                            ${permissions.map(permission => `
                                <label class="checkbox-item" title="${escapeAttribute(permission.description || '')}">
                                    <input type="checkbox" class="role-permission-checkbox" value="${permission.id}" ${(role?.permissions || []).includes(permission.name) ? 'checked' : ''}>
                                    ${escapeHtml(permission.name)}
                                </label>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="alert alert-warning">Перед сохранением система попросит подтвердить действие. Изменение прав повлияет на всех пользователей с этой ролью.</div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Сохранить</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>
            </div>
        </form>
    `;

    document.getElementById('roleForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveRole(roleId, role?.is_system || false);
    });
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

async function showOrganizationForm(organizationId = null) {
    const organization = organizationId ? await fetchAdminItem(`/admin/organizations?limit=1000`, organizationId) : null;
    showDictionaryForm({
        title: organizationId ? 'Редактировать организацию' : 'Создать организацию',
        item: organization,
        fields: ['name', 'description', 'color', 'icon'],
        submitText: organizationId ? 'Сохранить' : 'Создать',
        onSubmit: (payload) => saveOrganization(organizationId, payload)
    });
}

async function showCategoryForm(categoryId = null) {
    const category = categoryId ? await fetchAdminItem(`/admin/categories?limit=1000`, categoryId) : null;
    showDictionaryForm({
        title: categoryId ? 'Редактировать категорию' : 'Создать категорию',
        item: category,
        fields: ['name', 'description', 'color', 'icon'],
        submitText: categoryId ? 'Сохранить' : 'Создать',
        onSubmit: (payload) => saveCategory(categoryId, payload)
    });
}

function showDictionaryForm({ title, item, fields, submitText, onSubmit }) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = title;
    modalBody.innerHTML = `
        <form id="dictionaryForm">
            <div class="form-group">
                <label for="dictName">Название</label>
                <input type="text" id="dictName" name="name" required maxlength="100" value="${escapeAttribute(item?.name || '')}">
            </div>
            <div class="form-group">
                <label for="dictDescription">Описание</label>
                <textarea id="dictDescription" name="description">${escapeHtml(item?.description || '')}</textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="dictColor">Цвет</label>
                    <input type="color" id="dictColor" name="color" value="${escapeAttribute(item?.color || '#667eea')}">
                </div>
                <div class="form-group">
                    <label for="dictIcon">Иконка</label>
                    <input type="text" id="dictIcon" name="icon" maxlength="255" value="${escapeAttribute(item?.icon || '')}">
                </div>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">${submitText}</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>
            </div>
        </form>
    `;

    document.getElementById('dictionaryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {};
        if (fields.includes('name')) payload.name = document.getElementById('dictName').value.trim();
        if (fields.includes('description')) payload.description = document.getElementById('dictDescription').value.trim() || null;
        if (fields.includes('color')) payload.color = document.getElementById('dictColor').value || null;
        if (fields.includes('icon')) payload.icon = document.getElementById('dictIcon').value.trim() || null;

        if (!payload.name) {
            alert('Введите название');
            return;
        }

        await onSubmit(payload);
        closeModal();
    });

    modal.style.display = 'flex';
}

async function fetchAdminItem(path, id) {
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Ошибка загрузки записи');
    const data = await response.json();
    return (data.items || []).find(item => item.id === id) || null;
}

async function fetchAdminObject(path) {
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(await extractError(response));
    return response.json();
}

async function saveUser(userId) {
    const token = localStorage.getItem('access_token');
    const roleIds = Array.from(document.querySelectorAll('.user-role-checkbox:checked')).map(input => Number(input.value));
    const password = document.getElementById('userPassword').value;
    const payload = {
        email: document.getElementById('userEmail').value.trim(),
        first_name: document.getElementById('userFirstName').value.trim() || null,
        last_name: document.getElementById('userLastName').value.trim() || null,
        is_active: document.getElementById('userIsActive').checked,
        is_verified: document.getElementById('userIsVerified').checked,
        role_ids: roleIds
    };
    if (!userId) payload.username = document.getElementById('userUsername').value.trim();
    if (password) payload.password = password;

    const response = await fetch(`${API_BASE_URL}/admin/users${userId ? `/${userId}` : ''}`, {
        method: userId ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await extractError(response));
    const data = await response.json();
    const passwordBox = document.getElementById('temporaryPasswordBox');
    if (!userId && data.temporary_password && passwordBox) {
        passwordBox.textContent = `Временный пароль: ${data.temporary_password}`;
        passwordBox.style.display = 'block';
    } else {
        closeModal();
    }
    await loadUsers();
    await refreshDashboardCounts();
}

async function saveRole(roleId, isSystem) {
    if (!confirm('Сохранить изменения роли и прав?')) return;
    const token = localStorage.getItem('access_token');
    const permissionIds = Array.from(document.querySelectorAll('.role-permission-checkbox:checked')).map(input => Number(input.value));
    const payload = {
        description: document.getElementById('roleDescription').value.trim() || null,
        permission_ids: permissionIds
    };
    if (!isSystem) payload.name = document.getElementById('roleName').value.trim();

    const response = await fetch(`${API_BASE_URL}/admin/roles${roleId ? `/${roleId}` : ''}`, {
        method: roleId ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await extractError(response));
    closeModal();
    await loadRoles();
    await refreshDashboardCounts();
}

function selectedUserIds() {
    return Array.from(document.querySelectorAll('.user-select:checked')).map(input => Number(input.value));
}

async function bulkUpdateUsers(isActive) {
    const ids = selectedUserIds();
    if (!ids.length) {
        alert('Выберите пользователей');
        return;
    }
    if (!confirm(`${isActive ? 'Активировать' : 'Деактивировать'} выбранные учетные записи?`)) return;
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${API_BASE_URL}/admin/users/bulk-status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: ids, is_active: isActive })
    });
    if (!response.ok) throw new Error(await extractError(response));
    await loadUsers();
}

async function exportUsers() {
    const search = document.getElementById('userSearch')?.value || '';
    const statusFilter = document.getElementById('userStatusFilter')?.value || '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('is_active', statusFilter === 'active');
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${API_BASE_URL}/admin/users/export?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(await extractError(response));

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'users.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function saveOrganization(organizationId, payload) {
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${API_BASE_URL}/admin/organizations${organizationId ? `/${organizationId}` : ''}`, {
        method: organizationId ? 'PUT' : 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await extractError(response));
    await loadOrganizations();
    await refreshDashboardCounts();
}

async function saveCategory(categoryId, payload) {
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${API_BASE_URL}/admin/categories${categoryId ? `/${categoryId}` : ''}`, {
        method: categoryId ? 'PUT' : 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await extractError(response));
    await loadCategories();
    await refreshDashboardCounts();
}

async function refreshDashboardCounts() {
    const token = localStorage.getItem('access_token');
    const [usersResponse, rolesResponse, organizationsResponse, categoriesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/users?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/roles?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/organizations?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/categories?limit=1`, { headers: { 'Authorization': `Bearer ${token}` } })
    ]);
    if (usersResponse.ok) document.getElementById('userCount').textContent = (await usersResponse.json()).total || 0;
    if (rolesResponse.ok) document.getElementById('roleCount').textContent = (await rolesResponse.json()).total || 0;
    if (organizationsResponse.ok) document.getElementById('labelCount').textContent = (await organizationsResponse.json()).total || 0;
    if (categoriesResponse.ok) document.getElementById('categoryCount').textContent = (await categoriesResponse.json()).total || 0;
}

async function extractError(response) {
    const body = await response.json().catch(() => null);
    return body?.detail || `HTTP ${response.status}`;
}

function renderColor(color) {
    if (!color) return '-';
    return `<span class="color-chip" style="background:${escapeAttribute(color)}"></span> ${escapeHtml(color)}`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

async function viewUser(userId) {
    try {
        const user = await fetchAdminObject(`/admin/users/${userId}`);
        alert(`Пользователь: ${user.username}\nEmail: ${user.email}\nРоли: ${(user.roles || []).join(', ') || 'нет'}\nПрава: ${(user.permissions || []).join(', ') || 'нет'}`);
    } catch (error) {
        alert(error.message || 'Ошибка просмотра пользователя');
    }
}

async function editUser(userId) {
    try {
        await showUserForm(userId);
    } catch (error) {
        alert(error.message || 'Ошибка открытия пользователя');
    }
}

async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(await extractError(response));
        await loadUsers();
        await refreshDashboardCounts();
    } catch (error) {
        alert(error.message || 'Ошибка удаления пользователя');
    }
}

async function editRole(roleId) {
    try {
        await showRoleForm(roleId);
    } catch (error) {
        alert(error.message || 'Ошибка открытия роли');
    }
}

async function deleteRole(roleId) {
    if (!confirm('Вы уверены, что хотите удалить эту роль?')) return;
    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/admin/roles/${roleId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(await extractError(response));
        await loadRoles();
        await refreshDashboardCounts();
    } catch (error) {
        alert(error.message || 'Ошибка удаления роли');
    }
}

async function editLabel(labelId) {
    console.log('Edit label:', labelId);
}

async function editOrganization(organizationId) {
    try {
        await showOrganizationForm(organizationId);
    } catch (error) {
        alert(error.message || 'Ошибка открытия формы организации');
    }
}

async function editCategory(categoryId) {
    try {
        await showCategoryForm(categoryId);
    } catch (error) {
        alert(error.message || 'Ошибка открытия формы категории');
    }
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
