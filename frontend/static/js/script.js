


ymaps = window.ymaps;
// функция асинхронная, так как она может занимать много времени в основном потоке 
// *зависит от соединения, стабильности API и другого
async function initMap() {
    // основной объект для загрузки других объектов карты
    ymaps3.strictMode = true;

    await ymaps3.ready;
    const { YMap, YMapDefaultSchemeLayer } = ymaps3;

    // подложка, на которой будут располагаться маркеры
    const map = new YMap(
        document.getElementById('map'),
        {
            location: {
                center: [37.588144, 55.733842],
                zoom: 10
            }
        }
    );

    map.addChild(new YMapDefaultSchemeLayer());
}

initMap();