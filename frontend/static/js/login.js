/**
 * Login Page Script
 */

const API_BASE_URL = '/api/v1';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');

    loginForm.addEventListener('submit', handleLogin);
});

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');

    errorDiv.style.display = 'none';
    loadingDiv.style.display = 'flex';

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        // Не все ответы гарантированно JSON (например, HTML при 500/прокси/редиректе),
        // поэтому сначала читаем как текст и уже потом пытаемся распарсить.
        const rawText = await response.text();
        let data = null;
        try {
            data = rawText ? JSON.parse(rawText) : null;
        } catch (_) {
            data = null;
        }

        if (!response.ok) {
            const serverMsg =
                (data && (data.detail || data.message)) ||
                (rawText && rawText.trim().slice(0, 300)) ||
                `HTTP ${response.status}`;
            throw new Error(serverMsg || 'Ошибка входа');
        }

        // Сохранить токен
        if (!data || !data.access_token) {
            throw new Error('Сервер вернул неожиданный ответ (нет access_token)');
        }
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('token_type', data.token_type || 'bearer');
        
        if (rememberMe) {
            localStorage.setItem('remember_email', email);
        } else {
            localStorage.removeItem('remember_email');
        }

        // Сохранить информацию пользователя
        if (data.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Перенаправить на соответствующую страницу
            if (data.user.roles && data.user.roles.includes('admin')) {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'index.html';
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Автозаполнение email если он был сохранён
window.addEventListener('load', () => {
    const savedEmail = localStorage.getItem('remember_email');
    if (savedEmail) {
        document.getElementById('email').value = savedEmail;
        document.getElementById('rememberMe').checked = true;
    }
});
