/**
 * Profile Page Script
 */

const API_BASE_URL = '/api/v1';
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Проверить аутентификацию
    if (!localStorage.getItem('access_token')) {
        window.location.href = 'login.html';
        return;
    }

    // Загрузить информацию пользователя
    await loadUserProfile();

    // Установить обработчики событий
    setupEventListeners();
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
        displayUserProfile();

    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Ошибка загрузки профиля');
    }
}

function displayUserProfile() {
    if (!currentUser) return;

    // Заполнить основные данные
    document.getElementById('username').textContent = currentUser.username;
    document.getElementById('username-field').value = currentUser.username;
    document.getElementById('email-field').value = currentUser.email;
    document.getElementById('firstName-field').value = currentUser.first_name || '';
    document.getElementById('lastName-field').value = currentUser.last_name || '';

    // Статус
    document.getElementById('status-field').value = currentUser.is_active ? 'Активный' : 'Неактивный';
    document.getElementById('verified-field').value = currentUser.is_verified ? 'Да' : 'Нет';

    // Роли
    const rolesField = document.getElementById('roles-field');
    rolesField.innerHTML = '';
    if (currentUser.roles && currentUser.roles.length > 0) {
        currentUser.roles.forEach(role => {
            const badge = document.createElement('span');
            badge.className = 'badge badge-primary';
            badge.textContent = role;
            rolesField.appendChild(badge);
        });
    }

    // Разрешения
    const permissionsField = document.getElementById('permissions-field');
    permissionsField.innerHTML = '';
    if (currentUser.permissions && currentUser.permissions.length > 0) {
        currentUser.permissions.forEach(permission => {
            const badge = document.createElement('span');
            badge.className = 'badge badge-success';
            badge.textContent = permission;
            permissionsField.appendChild(badge);
        });
    } else {
        permissionsField.innerHTML = '<span>Нет разрешений</span>';
    }

    // Даты
    const createdDate = new Date(currentUser.created_at).toLocaleDateString('ru-RU');
    document.getElementById('created-at-field').value = createdDate;

    if (currentUser.last_login) {
        const lastLoginDate = new Date(currentUser.last_login).toLocaleString('ru-RU');
        document.getElementById('last-login-field').value = lastLoginDate;
    }

    const adminPanelAction = document.getElementById('adminPanelAction');
    if (adminPanelAction) {
        adminPanelAction.style.display = currentUser.roles?.includes('admin') ? 'flex' : 'none';
    }
}

function setupEventListeners() {
    // Переключение между секциями
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', handleMenuItemClick);
    });

    // Форма смены пароля
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePassword);
    }

    // Кнопка выхода
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Кнопка выхода из всех сессий
    const logoutAllBtn = document.getElementById('logoutAllBtn');
    if (logoutAllBtn) {
        logoutAllBtn.addEventListener('click', handleLogoutAll);
    }
}

function handleMenuItemClick(e) {
    e.preventDefault();
    
    // Удалить активный класс со всех элементов
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Добавить активный класс текущему элементу
    this.classList.add('active');
    
    // Показать соответствующую секцию
    const sectionId = this.getAttribute('data-section');
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.add('active');
    }
}

async function handleChangePassword(e) {
    e.preventDefault();

    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    const errorDiv = document.querySelector('#change-password .alert-error');
    const successDiv = document.querySelector('#change-password .alert-success');

    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    try {
        if (newPassword !== confirmPassword) {
            throw new Error('Новые пароли не совпадают');
        }

        if (newPassword.length < 8) {
            throw new Error('Пароль должен быть не менее 8 символов');
        }

        const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/;
        if (!passwordRegex.test(newPassword)) {
            throw new Error('Пароль должен содержать заглавные буквы, строчные буквы и цифры');
        }

        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                old_password: oldPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Ошибка при смене пароля');
        }

        successDiv.textContent = 'Пароль успешно изменен. Требуется повторный вход.';
        successDiv.style.display = 'block';

        // Очистить форму
        e.target.reset();

        // Выход через 2 секунды
        setTimeout(() => {
            handleLogout();
        }, 2000);

    } catch (error) {
        console.error('Password change error:', error);
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        const token = localStorage.getItem('access_token');
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    // Очистить локальное хранилище
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_type');
    localStorage.removeItem('user');

    // Перенаправить на главную страницу
    window.location.href = 'login.html';
}

async function handleLogoutAll() {
    if (!confirm('Вы уверены? Вы будете выходом из всех сессий.')) {
        return;
    }

    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка выхода');
        }

        // Очистить локальное хранилище
        localStorage.removeItem('access_token');
        localStorage.removeItem('token_type');
        localStorage.removeItem('user');

        window.location.href = 'login.html';

    } catch (error) {
        console.error('Logout all error:', error);
        alert('Ошибка выхода: ' + error.message);
    }
}
