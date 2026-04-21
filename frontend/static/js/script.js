const DEFAULT_CENTER = [55.7558, 37.6173];
const DEFAULT_ZOOM = 10;

let map = null;
let markers = [];
let objectsData = [];

function initMap() {
    ymaps.ready(function() {
        map = new ymaps.Map('map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            controls: ['zoomControl', 'typeSelector']
        });
        
        loadObjects();
        loadFilters();
    });
}

function loadObjects(filters) {
    filters = filters || {};
    showLoading(true);
    
    var params = new URLSearchParams(filters).toString();
    
    fetch('/api/v1/objects?' + params)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            objectsData = data.items || [];
            renderMarkers(objectsData);
            renderObjectsList(objectsData);
            
            if (objectsData.length === 0) {
                document.getElementById('noResults').style.display = 'block';
            } else {
                document.getElementById('noResults').style.display = 'none';
            }
        })
        .catch(function(error) {
            console.error('Ошибка загрузки объектов:', error);
        })
        .finally(function() {
            showLoading(false);
        });
}

function renderMarkers(objects) {
    markers.forEach(function(m) { map.geoObjects.remove(m); });
    markers = [];
    
    objects.forEach(function(obj) {
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
        
        placemark.events.add('click', function() {
            showObjectCard(obj);
        });
        
        map.geoObjects.add(placemark);
        markers.push(placemark);
    });
}

function renderObjectsList(objects) {
    var list = document.getElementById('objectsList');
    list.innerHTML = '';
    
    objects.forEach(function(obj) {
        var li = document.createElement('li');
        li.textContent = obj.name;
        li.dataset.id = obj.id;
        
        li.addEventListener('click', function() {
            showObjectCard(obj);
            map.setCenter([obj.latitude, obj.longitude], 15);
        });
        
        list.appendChild(li);
    });
}

function loadFilters() {
    fetch('/api/v1/filters')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            populateSelect('categoryFilter', data.categories);
            populateSelect('statusFilter', data.statuses);
            populateSelect('cityFilter', data.cities);
        })
        .catch(function(error) {
            console.error('Ошибка загрузки фильтров:', error);
        });
}

function populateSelect(id, values) {
    var select = document.getElementById(id);
    select.innerHTML = '<option value="">Все</option>';
    
    values.forEach(function(val) {
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
document.getElementById('closeCard').addEventListener('click', function() {
    document.getElementById('objectCard').style.display = 'none';
});

document.addEventListener('DOMContentLoaded', initMap);