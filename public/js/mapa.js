// Mapa do município com Leaflet (cópia local em /vendor/leaflet) e mapa base do OpenStreetMap.
// Adaptado do Projeto_clima. O texto do popup entra como elemento com textContent,
// porque o Leaflet trata strings como HTML (risco de XSS com dados digitados).

const URL_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ZOOM_MUNICIPIO = 11;

let mapaAtual = null;

export function destruirMapa() {
  if (mapaAtual) {
    mapaAtual.remove();
    mapaAtual = null;
  }
}

export function mostrarMapa(container, { latitude, longitude, rotulo }) {
  const L = globalThis.L;
  if (!L) throw new Error('Biblioteca de mapas não carregada');
  destruirMapa();

  mapaAtual = L.map(container, { scrollWheelZoom: false }).setView([latitude, longitude], ZOOM_MUNICIPIO);
  L.tileLayer(URL_TILES, { maxZoom: 18, attribution: ATRIBUICAO }).addTo(mapaAtual);

  const popup = document.createElement('span');
  popup.textContent = rotulo;
  L.marker([latitude, longitude], { title: rotulo, alt: `Localização de ${rotulo}` })
    .addTo(mapaAtual)
    .bindPopup(popup);

  // O modal acabou de abrir: recalcula o tamanho do contêiner
  requestAnimationFrame(() => mapaAtual?.invalidateSize());
  return mapaAtual;
}
