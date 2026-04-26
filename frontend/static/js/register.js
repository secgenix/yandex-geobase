/**
 * Registration Page Script
 */

const API_BASE_URL = '/api/v1';

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    
    registerForm.addEventListener('submit', handleRegister);
});

async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const agree = document.getElementById('agree').checked;

    const errorDiv = document.getElementById('error');
    const successDiv = document.getElementById('success');
    const loadingDiv = document.getElementById('loading');

    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    loadingDiv.style.display = 'flex';

    try {
        // Валидация
        if (!agree) {
            throw new Error('Вы должны согласиться с условиями использования');
        }

        if (password !== confirmPassword) {
            throw new Error('Пароли не совпадают');
        }

        if (password.length < 8) {
            throw new Error('Пароль должен быть не менее 8 символов');
        }

        // Проверка надежности пароля
        const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/;
        if (!passwordRegex.test(password)) {
            throw new Error('Пароль должен содержать заглавные буквы, строчные буквы и цифры');
        }

        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                email: email,
                first_name: firstName,
                last_name: lastName,
                password: password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Ошибка регистрации');
        }

        successDiv.textContent = 'Регистрация успешна! Перенаправление на страницу входа...';
        successDiv.style.display = 'block';

        // Перенаправить на страницу входа через 2 секунды
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);

    } catch (error) {
        console.error('Registration error:', error);
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    } finally {
        loadingDiv.style.display = 'none';
    }
}
