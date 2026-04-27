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

            headerNav.innerHTML = `
                <span style="color: white; font-size: 14px;">👤 ${user.username || 'Пользователь'}</span>
                ${isAdmin ? '<a href="admin.html">🔐 Админ</a>' : ''}
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

const DEFAULT_CENTER = [55.7558, 37.6173];
const DEFAULT_ZOOM = 10;

let map = null;
let markers = [];
let objectsData = [];
let mapContextMenuEl = null;
let lastContextCoords = null;
let mapMarkerCollection = null;
let mapMarkerPlacemarks = [];

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
                if (lastContextCoords) createMapMarker(lastContextCoords);
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
    var placemark = new ymaps.Placemark(
        coords,
        {
            id: marker.id,
            balloonContentBody: '<b>Метка</b><br>' + coords[0].toFixed(6) + ', ' + coords[1].toFixed(6)
        },
        {
            preset: 'islands#redIcon'
        }
    );

    mapMarkerCollection.add(placemark);
    mapMarkerPlacemarks.push(placemark);
}

function loadMapMarkers() {
    fetch('/api/v1/map-markers')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var items = (data && data.items) ? data.items : [];
            items.forEach(renderMapMarker);
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
        body: JSON.stringify({ latitude: coords[0], longitude: coords[1] })
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
            renderMapMarker(marker);
        })
        .catch(function (e) {
            console.error('Ошибка сохранения метки:', e);
            // Фолбэк: показать локально, даже если БД недоступна
            renderMapMarker({ id: null, latitude: coords[0], longitude: coords[1] });
        });
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
            populateSelect('categoryFilter', data.categories);
            populateSelect('statusFilter', data.statuses);
            populateSelect('cityFilter', data.cities);
        })
        .catch(function (error) {
            console.error('Ошибка загрузки фильтров:', error);
        });
}

function populateSelect(id, values) {
    var select = document.getElementById(id);
    select.innerHTML = '<option value="">Все</option>';

    values.forEach(function (val) {
        var option = document.createElement('option');
        option.value = val;
        option.textContent = val;
        select.appendChild(option);
    });
}

function showObjectCard(obj) {
    document.getElementById('cardName').textContent = obj.name;
    document.getElementById('cardAddress').textContent = obj.address || '-';
    document.getElementById('cardCategory').textContent = obj.category || '-';
    document.getElementById('cardStatus').textContent = obj.status || '-';
    document.getElementById('cardCoords').textContent = obj.latitude + ', ' + obj.longitude;
    document.getElementById('cardDescription').textContent = obj.description || '-';

    document.getElementById('objectCard').style.display = 'block';
}

function applyFilters() {
    var filters = {};

    var search = document.getElementById('searchInput').value;
    if (search) filters.search = search;

    var category = document.getElementById('categoryFilter').value;
    if (category) filters.category = category;

    var status = document.getElementById('statusFilter').value;
    if (status) filters.status = status;

    var city = document.getElementById('cityFilter').value;
    if (city) filters.city = city;

    loadObjects(filters);
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('categoryFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('cityFilter').value = '';
    loadObjects({});
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

document.addEventListener('DOMContentLoaded', initMap);