// Authentication
const API_BASE_URL = '/api/v1';
document.addEventListener('DOMContentLoaded', () => {
    updateAuthHeader();
});

function updateAuthHeader() {
    const token = localStorage.getItem('access_token');
    const headerNav = document.getElementById('headerNav');

    if (token && headerNav) {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const isAdmin = user.roles && user.roles.includes('admin');
            const isModerator = user.roles && user.roles.includes('moderator');

            headerNav.innerHTML = `
                <span style="color: white; font-size: 14px;">👤 ${user.username || 'Пользователь'}</span>
                ${isAdmin ? '<a href="admin.html">🔐 Админ</a>' : ''}
                ${isModerator ? '<span style="color: #ffd700; font-size: 12px;">⭐ Модератор</span>' : ''}
                <a href="profile.html">Профиль</a>
                <button onclick="logout()" style="background: #e74c3c;">Выход</button>
            `;
        } catch (e) {
            console.error('Error parsing user data:', e);
            headerNav.innerHTML = `
                <a href="profile.html">Профиль</a>
                <button onclick="logout()" style="background: #e74c3c;">Выход</button>
            `;
        }
    }
}

function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        const token = localStorage.getItem('access_token');
        if (token) {
            fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(err => console.error('Logout error:', err));
        }

        localStorage.removeItem('access_token');
        localStorage.removeItem('token_type');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
}

// Проверка, имеет ли пользователь право устанавливать метки (admin или moderator)
function canUserPlaceMarkers() {
    const token = localStorage.getItem('access_token');
    if (!token) return false;

    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const roles = user.roles || [];
        return roles.includes('admin') || roles.includes('moderator');
    } catch (e) {
        return false;
    }
}

const DEFAULT_CENTER = [55.04, 82.92]; // Novosibirsk
const DEFAULT_ZOOM = 10;

let map = null;
let markers = [];
let objectsData = [];
let mapContextMenuEl = null;
let lastContextCoords = null;
let mapMarkerCollection = null;
let mapMarkerPlacemarks = [];
let mapMarkersData = [];
let filterOptions = { categories: [], organizations: [] };

function initMap() {
    ymaps.ready(function () {
        map = new ymaps.Map('map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            controls: ['zoomControl', 'typeSelector']
        });

        mapMarkerCollection = new ymaps.GeoObjectCollection();
        map.geoObjects.add(mapMarkerCollection);

        setupMapContextMenu();
        loadMapMarkers();
        loadObjects();
        loadFilters();
    });
}

function setupMapContextMenu() {
    mapContextMenuEl = document.getElementById('mapContextMenu');
    var mapEl = document.getElementById('map');
    if (!mapContextMenuEl || !mapEl || !map) return;

    // Кнопка всегда видна, но при клике проверяем права
    var addMarkerLink = mapContextMenuEl.querySelector('a[data-action="add-marker"]');
    if (addMarkerLink) {
        addMarkerLink.title = canUserPlaceMarkers() ? 'Установить метку' : 'У вас нет прав для установки меток';
    }

    // Используем нативное событие карты, чтобы coords совпадали с курсором
    map.events.add('contextmenu', function (e) {
        var coords = e.get('coords');
        var domEvent = e.get('domEvent');

        lastContextCoords = coords || null;

        // domEvent может быть undefined в редких случаях
        var oe = domEvent && domEvent.originalEvent ? domEvent.originalEvent : null;
        var clientX = oe ? oe.clientX : 0;
        var clientY = oe ? oe.clientY : 0;

        showMapContextMenu(clientX, clientY);

        if (domEvent && typeof domEvent.preventDefault === 'function') domEvent.preventDefault();
        if (domEvent && typeof domEvent.stopPropagation === 'function') domEvent.stopPropagation();
    });

    // Клик в меню не должен закрывать его до обработки
    mapContextMenuEl.addEventListener('click', function (event) {
        event.stopPropagation();

        var target = event.target;
        if (target && target.matches && target.matches('a[data-action]')) {
            event.preventDefault();
            var action = target.getAttribute('data-action');

            if (action === 'add-marker') {
                if (!canUserPlaceMarkers()) {
                    alert('У вас нет прав для установки меток. Только администраторы и модераторы могут устанавливать метки.');
                    hideMapContextMenu();
                    return;
                }
                if (lastContextCoords) openMarkerModal(lastContextCoords);
            }

            hideMapContextMenu();
        }
    });

    // Закрытие: любой левый клик вне меню
    document.addEventListener('click', function (event) {
        if (!mapContextMenuEl) return;
        if (mapContextMenuEl.style.display === 'none') return;
        if (!event.target || !mapContextMenuEl.contains(event.target)) hideMapContextMenu();
    });

    // Закрытие: Esc
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') hideMapContextMenu();
    });

    // Закрытие: любое действие с картой (перемещение/зум)
    map.events.add('actionbegin', function () {
        hideMapContextMenu();
    });
    map.events.add('click', function () {
        hideMapContextMenu();
    });
}

function showMapContextMenu(clientX, clientY) {
    if (!mapContextMenuEl) return;

    // сначала показываем, чтобы корректно измерить размеры
    mapContextMenuEl.style.display = 'block';

    var menuRect = mapContextMenuEl.getBoundingClientRect();
    var margin = 8;

    var x = clientX;
    var y = clientY;

    var maxX = window.innerWidth - menuRect.width - margin;
    var maxY = window.innerHeight - menuRect.height - margin;

    if (x > maxX) x = Math.max(margin, maxX);
    if (y > maxY) y = Math.max(margin, maxY);

    mapContextMenuEl.style.left = x + 'px';
    mapContextMenuEl.style.top = y + 'px';
}

function hideMapContextMenu() {
    if (!mapContextMenuEl) return;
    mapContextMenuEl.style.display = 'none';
}

function renderMapMarker(marker) {
    if (!mapMarkerCollection || !marker) return;

    var coords = [marker.latitude, marker.longitude];
    var title = marker.name || 'Метка';
    var details = [];
    if (marker.organization) details.push('Организация: ' + escapeHtml(marker.organization));
    if (marker.category) details.push('Категория: ' + escapeHtml(marker.category));
    if (marker.description) details.push(escapeHtml(marker.description));
    var placemark = new ymaps.Placemark(
        coords,
        {
            id: marker.id,
            balloonContentBody: '<b>' + escapeHtml(title) + '</b><br>' + details.join('<br>') + '<br>' + coords[0].toFixed(6) + ', ' + coords[1].toFixed(6)
        },
        {
            preset: 'islands#redIcon'
        }
    );

    mapMarkerCollection.add(placemark);
    mapMarkerPlacemarks.push(placemark);
}

function clearMapMarkers() {
    if (mapMarkerCollection) mapMarkerCollection.removeAll();
    mapMarkerPlacemarks = [];
}

function markerMatchesFilters(marker, filters) {
    if (!marker) return false;

    if (filters.category_id && String(marker.category_id || '') !== String(filters.category_id)) {
        return false;
    }

    if (filters.organization_id && String(marker.organization_id || '') !== String(filters.organization_id)) {
        return false;
    }

    if (filters.search) {
        var search = String(filters.search).toLowerCase();
        var haystack = [marker.name, marker.description, marker.category, marker.organization]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        if (!haystack.includes(search)) return false;
    }

    return true;
}

function renderFilteredMapMarkers() {
    clearMapMarkers();

    var filters = getCurrentFilters();
    var visibleObjectIds = new Set(objectsData.map(function (obj) { return Number(obj.id); }));
    var visibleMarkers = mapMarkersData.filter(function (marker) {
        return visibleObjectIds.has(Number(marker.id)) && markerMatchesFilters(marker, filters);
    });

    visibleMarkers.forEach(renderMapMarker);
}

function loadMapMarkers() {
    fetch('/api/v1/map-markers')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var items = (data && data.items) ? data.items : [];
            mapMarkersData = items;
            renderFilteredMapMarkers();
        })
        .catch(function (e) {
            console.error('Ошибка загрузки меток:', e);
        });
}

function createMapMarker(coords) {
    if (!coords) return;

    var token = localStorage.getItem('access_token');

    fetch('/api/v1/map-markers', {
        method: 'POST',
        headers: Object.assign(
            { 'Content-Type': 'application/json' },
            token ? { 'Authorization': 'Bearer ' + token } : {}
        ),
        body: JSON.stringify(coords)
    })
        .then(function (r) {
            if (!r.ok) {
                return r.json().catch(function () { return null; }).then(function (body) {
                    var msg = body && body.detail ? body.detail : ('HTTP ' + r.status);
                    throw new Error(msg);
                });
            }
            return r.json();
        })
        .then(function (marker) {
            mapMarkersData = [marker].concat(mapMarkersData.filter(function (item) {
                return Number(item.id) !== Number(marker.id);
            }));
            loadObjects(getCurrentFilters());
        })
        .catch(function (e) {
            console.error('Ошибка сохранения метки:', e);
            // Фолбэк: показать локально, даже если БД недоступна
            alert('Не удалось сохранить метку: ' + e.message);
        });
}

function openMarkerModal(coords) {
    var modal = document.getElementById('markerModal');
    var form = document.getElementById('markerForm');
    if (!modal || !form || !coords) return;

    form.reset();
    form.dataset.latitude = coords[0];
    form.dataset.longitude = coords[1];

    // Очистка превью изображения
    var imagePreview = document.getElementById('imagePreview');
    if (imagePreview) imagePreview.style.display = 'none';
    document.getElementById('previewImg').src = '';

    // Попытка получить адрес через геокодинг Яндекс.Карт
    if (ymaps && map) {
        ymaps.geocode(coords).then(function (res) {
            var firstGeoObject = res.geoObjects.get(0);
            if (firstGeoObject) {
                var address = firstGeoObject.getAddressLine();
                document.getElementById('markerAddress').value = address || '';
            }
        }).catch(function (err) {
            console.error('Ошибка геокодинга:', err);
        });
    }

    modal.style.display = 'flex';
    document.getElementById('markerName').focus();
}

function closeMarkerModal() {
    var modal = document.getElementById('markerModal');
    if (modal) modal.style.display = 'none';
}

function submitMarkerForm(event) {
    event.preventDefault();

    var form = event.currentTarget;
    var payload = {
        latitude: Number(form.dataset.latitude),
        longitude: Number(form.dataset.longitude),
        name: document.getElementById('markerName').value.trim(),
        organization_id: document.getElementById('markerOrganization').value || null,
        category_id: document.getElementById('markerCategory').value || null,
        description: document.getElementById('markerDescription').value.trim() || null,
        address: document.getElementById('markerAddress').value.trim() || null,
        image_url: null
    };

    // Обработка загрузки изображения
    var imageInput = document.getElementById('markerImage');
    var file = imageInput && imageInput.files[0];

    if (file) {
        // Для демонстрации используем base64 (в продакшене нужно загружать на сервер)
        var reader = new FileReader();
        reader.onload = function (e) {
            payload.image_url = e.target.result; // base64 строка
            createMapMarker(payload);
        };
        reader.readAsDataURL(file);
    } else {
        createMapMarker(payload);
    }
}

function loadObjects(filters) {
    filters = filters || {};
    showLoading(true);

    var params = new URLSearchParams(filters).toString();

    fetch('/api/v1/objects?' + params)
        .then(function (response) { return response.json(); })
        .then(function (data) {
            objectsData = data.items || [];
            renderMarkers(objectsData);
            renderObjectsList(objectsData);
            renderFilteredMapMarkers();

            if (objectsData.length === 0) {
                document.getElementById('noResults').style.display = 'block';
            } else {
                document.getElementById('noResults').style.display = 'none';
            }
        })
        .catch(function (error) {
            console.error('Ошибка загрузки объектов:', error);
        })
        .finally(function () {
            showLoading(false);
        });
}

function renderMarkers(objects) {
    markers.forEach(function (m) { map.geoObjects.remove(m); });
    markers = [];

    objects.forEach(function (obj) {
        var placemark = new ymaps.Placemark(
            [obj.latitude, obj.longitude],
            {
                id: obj.id,
                balloonContentBody: '<b>' + obj.name + '</b><br>' + (obj.address || '')
            },
            {
                preset: 'islands#dotIcon',
                iconColor: '#ff6b00'
            }
        );

        placemark.events.add('click', function () {
            showObjectCard(obj);
        });

        map.geoObjects.add(placemark);
        markers.push(placemark);
    });
}

function renderObjectsList(objects) {
    var list = document.getElementById('objectsList');
    list.innerHTML = '';

    objects.forEach(function (obj) {
        var li = document.createElement('li');
        li.textContent = obj.name;
        li.dataset.id = obj.id;

        li.addEventListener('click', function () {
            showObjectCard(obj);
            map.setCenter([obj.latitude, obj.longitude], 15);
        });

        list.appendChild(li);
    });
}

function loadFilters() {
    fetch('/api/v1/filters')
        .then(function (response) { return response.json(); })
        .then(function (data) {
            filterOptions.categories = data.categories || [];
            filterOptions.organizations = data.organizations || [];
            populateSelect('categoryFilter', filterOptions.categories, 'Все категории');
            populateSelect('organizationFilter', filterOptions.organizations, 'Все организации');
            populateSelect('markerCategory', filterOptions.categories, 'Не выбрана');
            populateSelect('markerOrganization', filterOptions.organizations, 'Не выбрана');
        })
        .catch(function (error) {
            console.error('Ошибка загрузки фильтров:', error);
        });
}

function populateSelect(id, values, emptyText) {
    var select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="">' + (emptyText || 'Все') + '</option>';

    values.forEach(function (val) {
        var option = document.createElement('option');
        option.value = typeof val === 'object' ? val.id : val;
        option.textContent = typeof val === 'object' ? val.name : val;
        select.appendChild(option);
    });
}

function showObjectCard(obj) {
    document.getElementById('cardName').textContent = obj.name;

    // Отображаем адрес вместо координат, если адрес есть
    var addressText = obj.address || (obj.latitude + ', ' + obj.longitude);
    document.getElementById('cardAddress').textContent = addressText;

    document.getElementById('cardCategory').textContent = obj.category || '-';
    document.getElementById('cardOrganization').textContent = obj.organization || '-';
    document.getElementById('cardCoords').textContent = obj.latitude + ', ' + obj.longitude;
    document.getElementById('cardDescription').textContent = obj.description || '-';

    // Отображение изображения
    var imageContainer = document.getElementById('cardImageContainer');
    var cardImage = document.getElementById('cardImage');
    if (obj.image_url) {
        cardImage.src = obj.image_url;
        imageContainer.style.display = 'block';
    } else {
        imageContainer.style.display = 'none';
    }

    document.getElementById('objectCard').style.display = 'block';
}

function applyFilters() {
    loadObjects(getCurrentFilters());
}

function getCurrentFilters() {
    var filters = {};

    var search = document.getElementById('searchInput').value;
    if (search) filters.search = search;

    var category = document.getElementById('categoryFilter').value;
    if (category) filters.category_id = category;

    var organization = document.getElementById('organizationFilter').value;
    if (organization) filters.organization_id = organization;

    return filters;
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('categoryFilter').value = '';
    document.getElementById('organizationFilter').value = '';
    loadObjects({});
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

document.getElementById('searchBtn').addEventListener('click', applyFilters);
document.getElementById('applyFilters').addEventListener('click', applyFilters);
document.getElementById('clearFilters').addEventListener('click', clearFilters);
document.getElementById('closeCard').addEventListener('click', function () {
    document.getElementById('objectCard').style.display = 'none';
});
document.getElementById('markerForm').addEventListener('submit', submitMarkerForm);
document.getElementById('closeMarkerModal').addEventListener('click', closeMarkerModal);
document.getElementById('cancelMarkerModal').addEventListener('click', closeMarkerModal);

// Обработчик превью изображения
document.getElementById('markerImage').addEventListener('change', function (event) {
    var file = event.target.files[0];
    var preview = document.getElementById('imagePreview');
    var previewImg = document.getElementById('previewImg');

    if (file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.style.display = 'none';
        previewImg.src = '';
    }
});

// Обработчик удаления изображения
document.getElementById('removeImage').addEventListener('click', function () {
    document.getElementById('markerImage').value = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('previewImg').src = '';
});

document.addEventListener('DOMContentLoaded', initMap);
