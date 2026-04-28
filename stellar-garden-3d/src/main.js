import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './styles.css';

const canvas = document.querySelector('#scene-canvas');
const form = document.querySelector('#star-form');
const nameInput = document.querySelector('#star-name');
const noteInput = document.querySelector('#star-note');
const brightnessInput = document.querySelector('#star-brightness');
const brightnessValue = document.querySelector('#brightness-value');
const starList = document.querySelector('#star-list');
const detail = document.querySelector('#star-detail');
const emptyDetail = document.querySelector('#empty-detail');
const toast = document.querySelector('#toast');
const orbitToggle = document.querySelector('#orbit-toggle');
const cameraReset = document.querySelector('#camera-reset');
const statCount = document.querySelector('#stat-count');
const statSparks = document.querySelector('#stat-sparks');
const statBrightness = document.querySelector('#stat-brightness');

const moods = {
  curious: '탐험',
  calm: '고요',
  bold: '대담',
  lucky: '행운'
};

let selectedColor = '#ff6b5f';
let stars = [];
let selectedStarId = null;
let orbiting = true;
let lastToastTimer = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111018);
scene.fog = new THREE.FogExp2(0x111018, 0.035);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(5.8, 4.4, 7.6);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 4.2;
controls.maxDistance = 14;
controls.target.set(0, 0.2, 0);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const starObjects = new Map();
const clickableStars = [];

const coreGroup = new THREE.Group();
scene.add(coreGroup);

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xfff2d1, 2.4);
keyLight.position.set(4, 7, 3);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x4ecdc4, 1.2);
rimLight.position.set(-5, 1, -3);
scene.add(rimLight);

const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.82, 3),
  new THREE.MeshStandardMaterial({
    color: 0x1d1b22,
    emissive: 0x332017,
    roughness: 0.55,
    metalness: 0.18
  })
);
coreGroup.add(core);

const coreWire = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.9, 2),
  new THREE.MeshBasicMaterial({
    color: 0xf1c45d,
    wireframe: true,
    transparent: true,
    opacity: 0.32
  })
);
coreGroup.add(coreWire);

const gardenRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.28, 0.015, 12, 128),
  new THREE.MeshBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.65 })
);
gardenRing.rotation.x = Math.PI / 2;
coreGroup.add(gardenRing);

const glowTexture = createGlowTexture();
const orbitMaterial = new THREE.LineBasicMaterial({
  color: 0xf8ead1,
  transparent: true,
  opacity: 0.18
});

createDustField();

function createGlowTexture() {
  const size = 128;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = size;
  glowCanvas.height = size;
  const ctx = glowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.25, 'rgba(255,230,190,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDustField() {
  const count = 900;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [new THREE.Color('#f8ead1'), new THREE.Color('#4ecdc4'), new THREE.Color('#ff6b5f')];

  for (let index = 0; index < count; index += 1) {
    const radius = 9 + Math.random() * 18;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi) * 0.62;
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const color = palette[index % palette.length].clone().lerp(new THREE.Color('#ffffff'), Math.random() * 0.3);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  scene.add(new THREE.Points(geometry, material));
}

function makeOrbitLine(radius) {
  const points = [];
  for (let index = 0; index <= 160; index += 1) {
    const angle = (index / 160) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, orbitMaterial.clone());
  line.rotation.x = 0.03;
  return line;
}

function createStar(star) {
  const group = new THREE.Group();
  group.userData.starId = star.id;

  const color = new THREE.Color(star.color);
  const radius = 0.11 + star.brightness * 0.055;
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 2),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.7),
      roughness: 0.34,
      metalness: 0.08
    })
  );
  mesh.userData.starId = star.id;

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity: 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  glow.scale.setScalar(0.7 + star.brightness * 0.4);

  const orbit = makeOrbitLine(star.orbit_radius);
  orbit.material.color.copy(color);
  orbit.userData.starId = star.id;

  group.add(mesh, glow);
  scene.add(orbit);
  scene.add(group);

  const entry = {
    star,
    group,
    mesh,
    glow,
    orbit,
    angle: star.angle,
    pulse: 0
  };

  starObjects.set(star.id, entry);
  clickableStars.push(mesh);
  positionStar(entry, 0);
}

function removeStarObject(id) {
  const entry = starObjects.get(id);
  if (!entry) return;
  scene.remove(entry.group);
  scene.remove(entry.orbit);
  const meshIndex = clickableStars.indexOf(entry.mesh);
  if (meshIndex >= 0) clickableStars.splice(meshIndex, 1);
  entry.mesh.geometry.dispose();
  entry.mesh.material.dispose();
  entry.glow.material.dispose();
  entry.orbit.geometry.dispose();
  entry.orbit.material.dispose();
  starObjects.delete(id);
}

function positionStar(entry, elapsed) {
  const star = entry.star;
  const x = Math.cos(entry.angle) * star.orbit_radius;
  const z = Math.sin(entry.angle) * star.orbit_radius;
  const y = star.height + Math.sin(elapsed * 1.8 + star.id) * 0.12;
  entry.group.position.set(x, y, z);
}

function selectStar(id) {
  selectedStarId = id;
  const star = stars.find((item) => item.id === id);

  starObjects.forEach((entry) => {
    const selected = entry.star.id === id;
    entry.orbit.material.opacity = selected ? 0.62 : 0.18;
    entry.mesh.scale.setScalar(selected ? 1.3 : 1);
    entry.glow.material.opacity = selected ? 0.82 : 0.56;
  });

  renderDetail(star);
  renderStarList();
}

function renderStats(stats) {
  statCount.textContent = stats.count;
  statSparks.textContent = stats.sparks;
  statBrightness.textContent = stats.average_brightness;
}

function renderStarList() {
  starList.replaceChildren();
  stars.slice().reverse().forEach((star) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `star-list-item${star.id === selectedStarId ? ' selected' : ''}`;
    button.dataset.id = star.id;
    button.innerHTML = `
      <span class="star-dot" style="--star-color: ${star.color}"></span>
      <span class="star-list-name"></span>
      <span class="star-list-mood">${moods[star.mood]}</span>
    `;
    button.querySelector('.star-list-name').textContent = star.name;
    button.addEventListener('click', () => selectStar(star.id));
    starList.append(button);
  });
}

function renderDetail(star) {
  detail.replaceChildren();
  const hasStar = Boolean(star);
  detail.classList.toggle('hidden', !hasStar);
  emptyDetail.classList.toggle('hidden', hasStar);
  if (!star) return;

  const title = document.createElement('h2');
  title.textContent = star.name;

  const meta = document.createElement('p');
  meta.className = 'detail-meta';
  meta.textContent = `${moods[star.mood]} 궤도 · 광도 ${Number(star.brightness).toFixed(1)} · ${star.visits}회 반짝임`;

  const note = document.createElement('p');
  note.className = 'detail-note';
  note.textContent = star.note || '기록 없음';

  const actions = document.createElement('div');
  actions.className = 'detail-actions';

  const sparkButton = document.createElement('button');
  sparkButton.type = 'button';
  sparkButton.textContent = '반짝이기';
  sparkButton.addEventListener('click', () => sparkStar(star.id));

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'danger';
  deleteButton.textContent = '지우기';
  deleteButton.addEventListener('click', () => deleteStar(star.id));

  actions.append(sparkButton, deleteButton);
  detail.append(title, meta, note, actions);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || '요청을 처리하지 못했습니다.');
  }

  return payload;
}

async function loadGarden() {
  try {
    const payload = await fetchJson('/api/garden');
    stars = payload.stars;
    stars.forEach(createStar);
    renderStats(payload.stats);
    renderStarList();
    if (stars[0]) selectStar(stars[0].id);
    window.__stellarGardenReady = true;
  } catch (error) {
    showToast(error.message);
  }
}

async function sparkStar(id) {
  try {
    const payload = await fetchJson(`/api/stars/${id}/spark`, { method: 'PATCH' });
    updateStoredStar(payload.star);
    const entry = starObjects.get(id);
    if (entry) entry.pulse = 1;
    renderStats(payload.stats);
    renderDetail(payload.star);
    renderStarList();
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteStar(id) {
  try {
    const payload = await fetchJson(`/api/stars/${id}`, { method: 'DELETE' });
    stars = stars.filter((star) => star.id !== id);
    removeStarObject(id);
    selectedStarId = stars[0]?.id || null;
    renderStats(payload.stats);
    renderStarList();
    renderDetail(stars.find((star) => star.id === selectedStarId));
  } catch (error) {
    showToast(error.message);
  }
}

function updateStoredStar(updatedStar) {
  stars = stars.map((star) => (star.id === updatedStar.id ? updatedStar : star));
  const entry = starObjects.get(updatedStar.id);
  if (entry) entry.star = updatedStar;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(lastToastTimer);
  lastToastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2400);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  try {
    const payload = await fetchJson('/api/stars', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        mood: formData.get('mood'),
        color: selectedColor,
        brightness: brightnessInput.value,
        note: formData.get('note')
      })
    });

    stars.push(payload.star);
    createStar(payload.star);
    selectStar(payload.star.id);
    renderStats(payload.stats);
    nameInput.value = '';
    noteInput.value = '';
    nameInput.focus();
  } catch (error) {
    showToast(error.message);
  }
});

brightnessInput.addEventListener('input', () => {
  brightnessValue.textContent = Number(brightnessInput.value).toFixed(1);
});

document.querySelectorAll('.swatch').forEach((button) => {
  button.style.setProperty('--swatch-color', button.dataset.color);
  button.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach((swatch) => swatch.classList.remove('selected'));
    button.classList.add('selected');
    selectedColor = button.dataset.color;
  });
});

orbitToggle.addEventListener('click', () => {
  orbiting = !orbiting;
  orbitToggle.textContent = orbiting ? '궤도 정지' : '궤도 재개';
});

cameraReset.addEventListener('click', () => {
  camera.position.set(5.8, 4.4, 7.6);
  controls.target.set(0, 0.2, 0);
});

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
});

canvas.addEventListener('click', () => {
  raycaster.setFromCamera(pointer, camera);
  const [hit] = raycaster.intersectObjects(clickableStars, false);
  if (hit?.object?.userData.starId) {
    selectStar(hit.object.userData.starId);
  }
});

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  core.rotation.y += delta * 0.18;
  coreWire.rotation.y -= delta * 0.12;
  gardenRing.rotation.z += delta * 0.08;

  starObjects.forEach((entry) => {
    if (orbiting) entry.angle += entry.star.orbit_speed * delta;
    positionStar(entry, elapsed);

    entry.mesh.rotation.x += delta * 0.8;
    entry.mesh.rotation.y += delta * 0.55;

    if (entry.pulse > 0) {
      entry.pulse = Math.max(0, entry.pulse - delta * 1.7);
      const pulseScale = 1 + Math.sin(entry.pulse * Math.PI) * 1.2;
      entry.glow.scale.setScalar((0.7 + entry.star.brightness * 0.4) * pulseScale);
    } else {
      entry.glow.scale.setScalar(0.7 + entry.star.brightness * 0.4);
    }
  });

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

loadGarden();
animate();
