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
let contextMenuMarker = null;
let labelEditLastFocus = null;
let openObjectCardId = null;

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
        contextMenuMarker = findMarkerAtClientPoint(clientX, clientY, coords);

        renderMapContextMenu();
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

            if (action === 'edit-label') {
                openLabelEditModal(contextMenuMarker);
            }

            if (action === 'delete-marker') {
                deleteContextMarker(contextMenuMarker);
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

function renderMapContextMenu() {
    if (!mapContextMenuEl) return;

    var actions = ['<li><a href="#" data-action="add-marker" role="menuitem">Установить метку</a></li>'];
    if (isValidMarkerContext(contextMenuMarker)) {
        actions.push('<li><a href="#" data-action="edit-label" role="menuitem">Редактировать метку</a></li>');
        actions.push('<li><a href="#" data-action="delete-marker" role="menuitem">Удалить метку</a></li>');
    }

    mapContextMenuEl.innerHTML = '<ul role="menu">' + actions.join('') + '</ul>';

    var addMarkerLink = mapContextMenuEl.querySelector('a[data-action="add-marker"]');
    if (addMarkerLink) {
        addMarkerLink.title = canUserPlaceMarkers() ? 'Установить метку' : 'У вас нет прав для установки меток';
    }
}

function isValidMarkerContext(marker) {
    return Boolean(marker && Number.isFinite(Number(marker.id)) && Number.isFinite(Number(marker.latitude)) && Number.isFinite(Number(marker.longitude)));
}

function findMarkerAtClientPoint(clientX, clientY, coords) {
    var candidates = objectsData.concat(mapMarkersData);
    var best = null;
    var bestDistance = Infinity;

    candidates.forEach(function (obj) {
        if (!obj || !Number.isFinite(Number(obj.id)) || !Number.isFinite(Number(obj.latitude)) || !Number.isFinite(Number(obj.longitude))) return;

        var point = null;
        if (map && typeof map.options !== 'undefined' && typeof map.geoObjects !== 'undefined') {
            try {
                point = map.converter.globalToPage(map.options.get('projection').toGlobalPixels([Number(obj.latitude), Number(obj.longitude)], map.getZoom()));
            } catch (e) {
                point = null;
            }
        }

        var distance = Infinity;
        if (point) {
            distance = Math.hypot(point[0] - clientX, point[1] - clientY);
        } else if (coords) {
            distance = Math.hypot(Number(obj.latitude) - coords[0], Number(obj.longitude) - coords[1]);
        }

        if (distance < bestDistance) {
            bestDistance = distance;
            best = obj;
        }
    });

    return best && bestDistance <= 28 ? best : null;
}

function hideMapContextMenu() {
    if (!mapContextMenuEl) return;
    mapContextMenuEl.style.display = 'none';
    contextMenuMarker = null;
}

function renderMapMarker(marker) {
    if (!mapMarkerCollection || !marker) return;

    var coords = [marker.latitude, marker.longitude];
    var title = marker.name || 'Метка';
    var details = [];
    if (marker.address) details.push('Адрес: ' + escapeHtml(marker.address));
    if (marker.organization) details.push('Организация: ' + escapeHtml(marker.organization));
    if (marker.category) details.push('Категория: ' + escapeHtml(marker.category));
    if (marker.description) details.push(escapeHtml(marker.description));
    var placemark = new ymaps.Placemark(
        coords,
        {
            id: marker.id,
            balloonContentBody: '<b>' + escapeHtml(title) + '</b><br>' + details.join('<br>')
        },
        {
            preset: 'islands#redIcon'
        }
    );

    placemark.events.add('contextmenu', function (e) {
        var domEvent = e.get('domEvent');
        var oe = domEvent && domEvent.originalEvent ? domEvent.originalEvent : null;
        contextMenuMarker = marker;
        lastContextCoords = coords;
        renderMapContextMenu();
        showMapContextMenu(oe ? oe.clientX : 0, oe ? oe.clientY : 0);
        if (domEvent && typeof domEvent.preventDefault === 'function') domEvent.preventDefault();
        if (domEvent && typeof domEvent.stopPropagation === 'function') domEvent.stopPropagation();
    });

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
            closeMarkerModal();
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

    setImagePreview(null);

    // Попытка получить адрес через геокодинг Яндекс.Карт
    if (ymaps && map) {
        ymaps.geocode(coords).then(function (res) {
            var firstGeoObject = res.geoObjects.get(0);
            if (firstGeoObject) {
                var address = firstGeoObject.getAddressLine();
                document.getElementById('markerAddress').value = getDisplayAddress({
                    address: address,
                    latitude: coords[0],
                    longitude: coords[1]
                });
            }
        }).catch(function (err) {
            console.error('Ошибка геокодинга:', err);
            document.getElementById('markerAddress').value = getDisplayAddress({
                latitude: coords[0],
                longitude: coords[1]
            });
        });
    } else {
        document.getElementById('markerAddress').value = getDisplayAddress({
            latitude: coords[0],
            longitude: coords[1]
        });
    }

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('markerName').focus();
}

function closeMarkerModal() {
    var modal = document.getElementById('markerModal');
    var form = document.getElementById('markerForm');

    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }

    if (form) {
        form.reset();
        delete form.dataset.latitude;
        delete form.dataset.longitude;
    }

    setImagePreview(null);
}

function submitMarkerForm(event) {
    event.preventDefault();

    var form = event.currentTarget;
    var name = document.getElementById('markerName').value.trim();
    var latitude = Number(form.dataset.latitude);
    var longitude = Number(form.dataset.longitude);
    var address = document.getElementById('markerAddress').value.trim() || getDisplayAddress({
        latitude: latitude,
        longitude: longitude
    });

    if (!name) {
        alert('Укажите название метки.');
        document.getElementById('markerName').focus();
        return;
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        alert('Не удалось определить место для метки. Откройте форму заново через карту.');
        return;
    }

    var payload = {
        latitude: latitude,
        longitude: longitude,
        name: name,
        organization_id: document.getElementById('markerOrganization').value || null,
        category_id: document.getElementById('markerCategory').value || null,
        description: document.getElementById('markerDescription').value.trim() || null,
        address: address,
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
                balloonContentBody: '<b>' + escapeHtml(obj.name || 'Объект') + '</b><br>' + escapeHtml(getDisplayAddress(obj))
            },
            {
                preset: 'islands#dotIcon',
                iconColor: '#ff6b00'
            }
        );

        placemark.events.add('click', function () {
            showObjectCard(obj);
        });

        placemark.events.add('contextmenu', function (e) {
            var domEvent = e.get('domEvent');
            var oe = domEvent && domEvent.originalEvent ? domEvent.originalEvent : null;
            contextMenuMarker = obj;
            lastContextCoords = [obj.latitude, obj.longitude];
            renderMapContextMenu();
            showMapContextMenu(oe ? oe.clientX : 0, oe ? oe.clientY : 0);
            if (domEvent && typeof domEvent.preventDefault === 'function') domEvent.preventDefault();
            if (domEvent && typeof domEvent.stopPropagation === 'function') domEvent.stopPropagation();
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

function openLabelEditModal(marker) {
    if (!isValidMarkerContext(marker)) {
        alert('Не удалось определить метку для редактирования.');
        return;
    }

    var modal = document.getElementById('labelEditModal');
    var form = document.getElementById('labelEditForm');
    if (!modal || !form) return;

    labelEditLastFocus = document.activeElement;
    populateSelect('labelEditOrganization', filterOptions.organizations, 'Не выбрана');
    populateSelect('labelEditCategory', filterOptions.categories, 'Не выбрана');
    document.getElementById('labelEditId').value = marker.id;
    document.getElementById('labelEditName').value = marker.name || '';
    document.getElementById('labelEditDescription').value = marker.description || '';
    document.getElementById('labelEditAddress').value = marker.address || '';
    document.getElementById('labelEditOrganization').value = marker.organization_id || '';
    document.getElementById('labelEditCategory').value = marker.category_id || '';
    setLabelEditStatus('');
    validateLabelEditForm();

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('labelEditName').focus();
}

function closeLabelEditModal() {
    var modal = document.getElementById('labelEditModal');
    var form = document.getElementById('labelEditForm');

    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
    if (form) form.reset();
    setLabelEditStatus('');
    contextMenuMarker = null;

    if (labelEditLastFocus && typeof labelEditLastFocus.focus === 'function') {
        labelEditLastFocus.focus();
    }
    labelEditLastFocus = null;
}

function validateLabelEditForm() {
    var nameInput = document.getElementById('labelEditName');
    var saveButton = document.getElementById('saveLabelEditModal');
    var nameError = document.getElementById('labelEditNameError');
    var isValid = true;

    var name = nameInput.value.trim();

    nameError.textContent = '';
    nameInput.removeAttribute('aria-invalid');

    if (!name) {
        nameError.textContent = 'Укажите название метки.';
        nameInput.setAttribute('aria-invalid', 'true');
        isValid = false;
    }

    if (saveButton) saveButton.disabled = !isValid;
    return isValid;
}

function setLabelEditStatus(message, isError) {
    var statusEl = document.getElementById('labelEditStatus');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.classList.toggle('is-error', Boolean(isError));
}

function submitLabelEditForm(event) {
    event.preventDefault();
    if (!validateLabelEditForm()) return;

    var markerId = Number(document.getElementById('labelEditId').value);
    if (!Number.isFinite(markerId)) {
        setLabelEditStatus('Не удалось определить метку для сохранения.', true);
        return;
    }

    var token = localStorage.getItem('access_token');
    if (!token) {
        setLabelEditStatus('Для редактирования метки необходимо войти в систему.', true);
        return;
    }

    var saveButton = document.getElementById('saveLabelEditModal');
    var payload = {
        name: document.getElementById('labelEditName').value.trim(),
        description: document.getElementById('labelEditDescription').value.trim() || null,
        address: document.getElementById('labelEditAddress').value.trim() || null,
        organization_id: document.getElementById('labelEditOrganization').value || null,
        category_id: document.getElementById('labelEditCategory').value || null
    };

    if (saveButton) saveButton.disabled = true;
    setLabelEditStatus('Сохранение...');

    fetch('/api/v1/map-markers/' + encodeURIComponent(markerId), {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
    })
        .then(function (r) {
            if (!r.ok) {
                return r.json().catch(function () { return null; }).then(function (body) {
                    throw new Error(body && body.detail ? body.detail : 'HTTP ' + r.status);
                });
            }
            return r.json();
        })
        .then(function (marker) {
            applyMarkerUpdate(marker);
            closeLabelEditModal();
        })
        .catch(function (e) {
            setLabelEditStatus('Не удалось сохранить метку: ' + e.message, true);
            if (saveButton) saveButton.disabled = false;
        });
}

function applyMarkerUpdate(marker) {
    if (!marker || !Number.isFinite(Number(marker.id))) return;

    upsertMarkerData(objectsData, marker);
    upsertMarkerData(mapMarkersData, marker);

    renderObjectsList(objectsData);
    renderMarkers(objectsData);
    renderFilteredMapMarkers();
}

function upsertMarkerData(items, marker) {
    var index = items.findIndex(function (item) { return Number(item.id) === Number(marker.id); });
    if (index >= 0) items[index] = Object.assign({}, items[index], marker);
}

function deleteContextMarker(marker) {
    if (!isValidMarkerContext(marker)) {
        alert('Не удалось определить метку для удаления.');
        return;
    }
    if (!confirm('Удалить метку "' + (marker.name || 'Без названия') + '"?')) return;

    var token = localStorage.getItem('access_token');
    if (!token) {
        alert('Для удаления метки необходимо войти в систему.');
        return;
    }

    fetch('/api/v1/map-markers/' + encodeURIComponent(marker.id), {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(function (r) {
            if (!r.ok) {
                return r.json().catch(function () { return null; }).then(function (body) {
                    throw new Error(body && body.detail ? body.detail : 'HTTP ' + r.status);
                });
            }
            return r.json();
        })
        .then(function () {
            removeMarkerFromUi(marker.id);
        })
        .catch(function (e) {
            alert('Не удалось удалить метку: ' + e.message);
        });
}

function removeMarkerFromUi(markerId) {
    objectsData = objectsData.filter(function (obj) { return Number(obj.id) !== Number(markerId); });
    mapMarkersData = mapMarkersData.filter(function (marker) { return Number(marker.id) !== Number(markerId); });

    var objectCard = document.getElementById('objectCard');
    if (objectCard && Number(openObjectCardId) === Number(markerId)) {
        objectCard.classList.remove('is-open');
        objectCard.setAttribute('aria-hidden', 'true');
        openObjectCardId = null;
    }

    renderObjectsList(objectsData);
    renderMarkers(objectsData);
    renderFilteredMapMarkers();
    contextMenuMarker = null;
}

function showObjectCard(obj) {
    openObjectCardId = obj && obj.id;
    document.getElementById('cardName').textContent = getTextValue(obj.name, 'Без названия');

    document.getElementById('cardAddress').textContent = getDisplayAddress(obj);

    document.getElementById('cardCategory').textContent = getTextValue(obj.category);
    document.getElementById('cardOrganization').textContent = getTextValue(obj.organization);
    document.getElementById('cardDescription').textContent = getTextValue(obj.description);

    // Отображение изображения
    var imageContainer = document.getElementById('cardImageContainer');
    var cardImage = document.getElementById('cardImage');
    if (obj.image_url && imageContainer && cardImage) {
        cardImage.src = obj.image_url;
        imageContainer.classList.remove('is-empty');
        imageContainer.setAttribute('aria-hidden', 'false');
    } else {
        if (cardImage) cardImage.removeAttribute('src');
        if (imageContainer) {
            imageContainer.classList.add('is-empty');
            imageContainer.setAttribute('aria-hidden', 'false');
        }
    }

    var objectCard = document.getElementById('objectCard');
    objectCard.classList.add('is-open');
    objectCard.setAttribute('aria-hidden', 'false');
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

function getTextValue(value, fallback) {
    var text = value == null ? '' : String(value).trim();
    return text || fallback || 'Не указано';
}

function getDisplayAddress(obj) {
    var address = obj && obj.address ? String(obj.address).trim() : '';
    if (address) return address;

    var lat = Number(obj && obj.latitude);
    var lon = Number(obj && obj.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return lat.toFixed(6) + ', ' + lon.toFixed(6);
    }

    return 'Адрес не указан';
}

function setImagePreview(src) {
    var preview = document.getElementById('imagePreview');
    var previewImg = document.getElementById('previewImg');
    if (!preview || !previewImg) return;

    if (src) {
        previewImg.src = src;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
        previewImg.removeAttribute('src');
    }
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

document.getElementById('searchBtn').addEventListener('click', applyFilters);
document.getElementById('applyFilters').addEventListener('click', applyFilters);
document.getElementById('clearFilters').addEventListener('click', clearFilters);
document.getElementById('closeCard').addEventListener('click', function () {
    var objectCard = document.getElementById('objectCard');
    objectCard.classList.remove('is-open');
    objectCard.setAttribute('aria-hidden', 'true');
    openObjectCardId = null;
});
document.getElementById('markerForm').addEventListener('submit', submitMarkerForm);
document.getElementById('closeMarkerModal').addEventListener('click', closeMarkerModal);
document.getElementById('cancelMarkerModal').addEventListener('click', closeMarkerModal);
document.getElementById('labelEditForm').addEventListener('submit', submitLabelEditForm);
document.getElementById('labelEditName').addEventListener('input', validateLabelEditForm);
document.getElementById('closeLabelEditModal').addEventListener('click', closeLabelEditModal);
document.getElementById('cancelLabelEditModal').addEventListener('click', closeLabelEditModal);

document.getElementById('labelEditModal').addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        closeLabelEditModal();
        return;
    }

    if (event.key !== 'Tab') return;
    var focusable = Array.prototype.slice.call(event.currentTarget.querySelectorAll('button, input, textarea, select, a[href]'))
        .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    if (focusable.length === 0) return;

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

// Обработчик превью изображения
document.getElementById('markerImage').addEventListener('change', function (event) {
    var file = event.target.files[0];

    if (file) {
        if (!file.type || !file.type.startsWith('image/')) {
            alert('Выберите файл изображения.');
            event.target.value = '';
            setImagePreview(null);
            return;
        }

        var reader = new FileReader();
        reader.onload = function (e) {
            setImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);
    } else {
        setImagePreview(null);
    }
});

// Обработчик удаления изображения
document.getElementById('removeImage').addEventListener('click', function () {
    document.getElementById('markerImage').value = '';
    setImagePreview(null);
});

document.addEventListener('DOMContentLoaded', initMap);
