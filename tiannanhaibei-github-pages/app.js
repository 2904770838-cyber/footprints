const DATA_URL = "./data/china-regions.geojson?v=3";
const STORE_KEY = "china-travel-footprints-v1";
const NAME_KEY = "china-travel-footprints-name";
const MAX_IMAGE_EDGE = 1280;
const PHOTO_BUCKET = "travel-photos";
const LABEL_MODES = ["key", "all", "none"];
const TRAVELER_COLORS = ["#f2a23a", "#2a9d8f", "#e76f51", "#457b9d", "#8e6bbf", "#43aa8b", "#f77f00", "#d62828", "#118ab2", "#9b5de5"];
const KEY_LABEL_NAMES = new Set([
  "北京市",
  "天津市",
  "石家庄市",
  "太原市",
  "呼和浩特市",
  "沈阳市",
  "长春市",
  "哈尔滨市",
  "上海市",
  "南京市",
  "杭州市",
  "合肥市",
  "福州市",
  "南昌市",
  "济南市",
  "郑州市",
  "武汉市",
  "长沙市",
  "广州市",
  "南宁市",
  "海口市",
  "重庆市",
  "成都市",
  "贵阳市",
  "昆明市",
  "拉萨市",
  "西安市",
  "兰州市",
  "西宁市",
  "银川市",
  "乌鲁木齐市",
  "深圳市",
  "苏州市",
  "宁波市",
  "青岛市",
  "厦门市",
  "无锡市",
  "佛山市",
  "东莞市",
  "温州市",
  "泉州市",
  "大连市",
  "烟台市",
  "南通市",
  "常州市",
  "嘉兴市",
  "绍兴市",
  "金华市",
  "珠海市",
  "中山市",
  "惠州市",
  "唐山市",
  "徐州市",
  "洛阳市",
  "宜昌市",
  "襄阳市",
  "岳阳市",
  "三亚市",
  "桂林市",
  "鄂尔多斯市",
  "包头市",
  "榆林市",
  "台北市",
  "新北市",
  "桃园市",
  "台中市",
  "台南市",
  "高雄市",
  "新竹市",
  "基隆市",
]);

const els = {
  visitedCount: document.querySelector("#visitedCount"),
  photoCount: document.querySelector("#photoCount"),
  progressPercent: document.querySelector("#progressPercent"),
  resultCount: document.querySelector("#resultCount"),
  galleryCount: document.querySelector("#galleryCount"),
  searchInput: document.querySelector("#searchInput"),
  provinceFilter: document.querySelector("#provinceFilter"),
  placeCard: document.querySelector("#placeCard"),
  placeList: document.querySelector("#placeList"),
  gallery: document.querySelector("#gallery"),
  photoInput: document.querySelector("#photoInput"),
  importInput: document.querySelector("#importInput"),
  fitChinaBtn: document.querySelector("#fitChinaBtn"),
  toggleLabelsBtn: document.querySelector("#toggleLabelsBtn"),
  mapLabelToggleBtn: document.querySelector("#mapLabelToggleBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  clearAllBtn: document.querySelector("#clearAllBtn"),
  travelersSection: document.querySelector("#travelersSection"),
  travelerList: document.querySelector("#travelerList"),
  travelerCount: document.querySelector("#travelerCount"),
  viewModeText: document.querySelector("#viewModeText"),
  lightbox: document.querySelector("#lightbox"),
  lightboxImage: document.querySelector("#lightboxImage"),
  lightboxCaption: document.querySelector("#lightboxCaption"),
  lightboxClose: document.querySelector("#lightboxClose"),
};

let map;
let regionLayer;
let photoMarkerLayer;
let chinaBounds;
let regions = [];
let selectedId = null;
let listFilter = "all";
let activeOwnerId = "all";

const state = loadState();
const cloud = {
  enabled: false,
  ready: false,
  client: null,
  user: null,
  footprints: [],
  photos: [],
  error: "",
  refreshTimer: null,
};

init().catch((error) => {
  console.error(error);
  els.placeCard.innerHTML = `
    <div class="empty-state">
      <i data-lucide="circle-alert"></i>
      <h2>地图数据加载失败</h2>
      <p>${escapeHtml(error.message || "请检查本地服务是否已启动。")}</p>
    </div>`;
  refreshIcons();
});

async function init() {
  initMap();
  bindGlobalEvents();

  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`GeoJSON ${response.status}`);
  const geojson = await response.json();

  regions = geojson.features
    .map((feature) => ({
      id: feature.properties.id,
      code: feature.properties.code,
      name: feature.properties.name,
      province: feature.properties.province,
      kind: feature.properties.kind,
      source: feature.properties.source,
      feature,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  populateProvinceFilter();
  drawRegions(geojson);
  await initCloud();
  renderAll();

  setTimeout(() => map.invalidateSize(), 120);
}

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    preferCanvas: false,
    minZoom: 3,
    maxZoom: 11,
    worldCopyJump: false,
  }).setView([35.4, 104.2], 4);

  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}", {
    className: "terrain-tiles",
    maxNativeZoom: 8,
    maxZoom: 11,
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> | Source: Esri, USGS, NOAA',
  }).addTo(map);

  photoMarkerLayer = L.layerGroup().addTo(map);
}

async function initCloud() {
  const config = window.TIANTIAN_SUPABASE || {};
  if (!config.url || !config.anonKey) return;

  try {
    if (!window.supabase) throw new Error("Supabase SDK 未加载");
    cloud.client = window.supabase.createClient(config.url, config.anonKey);

    const sessionResult = await cloud.client.auth.getSession();
    let user = sessionResult.data.session?.user || null;
    if (!user) {
      const signInResult = await cloud.client.auth.signInAnonymously();
      if (signInResult.error) throw signInResult.error;
      user = signInResult.data.user;
    }

    cloud.user = user;
    ensureTravelerName();
    cloud.enabled = true;
    cloud.ready = true;
    await loadCloudData();
    cloud.refreshTimer = window.setInterval(loadCloudData, 15000);
  } catch (error) {
    cloud.enabled = false;
    cloud.ready = false;
    cloud.error = error.message || "云同步初始化失败";
    console.error(error);
  }
}

function drawRegions(geojson) {
  regionLayer = L.geoJSON(geojson, {
    style: styleForFeature,
    onEachFeature(feature, layer) {
      const { id } = feature.properties;
      bindCityLabel(layer);
      layer.on({
        click: () => selectRegion(id, true),
        mouseover: () => {
          if (selectedId !== id) layer.setStyle({ weight: 1.8, fillOpacity: 0.55 });
        },
        mouseout: () => refreshMapStyles(),
      });
    },
  }).addTo(map);

  chinaBounds = regionLayer.getBounds();
  map.fitBounds(chinaBounds, { padding: [22, 22] });
}

function styleForFeature(feature) {
  const id = feature.properties.id;
  const summary = getRegionSummary(id);
  const isSelected = selectedId === id;
  const fillColor = getRegionFillColor(id, summary);

  return {
    color: isSelected ? "#063f3d" : summary.any ? shadeColor(fillColor, -24) : "rgba(23, 76, 72, 0.62)",
    weight: isSelected ? 2.8 : summary.mine ? 1.35 : summary.any ? 1.1 : 0.72,
    opacity: isSelected ? 1 : 0.9,
    fillColor: summary.any ? fillColor : "#fff6df",
    fillOpacity: isSelected ? 0.78 : summary.photos ? 0.68 : summary.mine ? 0.58 : summary.any ? 0.44 : 0.2,
    dashArray: summary.any ? "" : "3 4",
  };
}

function bindGlobalEvents() {
  els.searchInput.addEventListener("input", () => renderList());
  els.provinceFilter.addEventListener("change", () => {
    if (els.provinceFilter.value) {
      focusProvince(els.provinceFilter.value);
      return;
    }
    selectedId = null;
    if (chinaBounds) map.fitBounds(chinaBounds, { padding: [22, 22] });
    renderAll();
  });

  document.querySelectorAll(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      listFilter = button.dataset.filter;
      document.querySelectorAll(".segmented button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderList();
    });
  });

  els.fitChinaBtn.addEventListener("click", () => {
    if (chinaBounds) map.fitBounds(chinaBounds, { padding: [22, 22] });
  });

  els.toggleLabelsBtn.addEventListener("click", cycleLabelMode);
  els.mapLabelToggleBtn.addEventListener("click", cycleLabelMode);
  els.exportBtn.addEventListener("click", exportData);
  els.importBtn.addEventListener("click", () => els.importInput.click());
  els.clearAllBtn.addEventListener("click", clearAllMyRecords);
  els.importInput.addEventListener("change", importData);
  els.photoInput.addEventListener("change", handlePhotoUpload);
  els.lightboxClose.addEventListener("click", closeLightbox);
  els.lightbox.addEventListener("click", (event) => {
    if (event.target === els.lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.lightbox.hidden) closeLightbox();
  });
}

function populateProvinceFilter() {
  const provinces = [...new Set(regions.map((region) => region.province))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  els.provinceFilter.insertAdjacentHTML(
    "beforeend",
    provinces.map((province) => `<option value="${escapeHtml(province)}">${escapeHtml(province)}</option>`).join(""),
  );
}

function renderAll() {
  renderTravelers();
  renderStats();
  renderSelectedPlace();
  renderList();
  renderGallery();
  refreshMapStyles();
  refreshPhotoMarkers();
  applyLabelVisibility();
  refreshIcons();
}

function renderStats() {
  const summaries = regions.map((region) => getRegionSummary(region.id));
  const visited = summaries.filter((summary) => summary.any).length;
  const photos = summaries.reduce((sum, summary) => sum + summary.photos, 0);
  const exactProgress = regions.length ? (visited / regions.length) * 100 : 0;
  const progress = visited === 0 ? "0%" : exactProgress < 1 ? `${exactProgress.toFixed(1)}%` : `${Math.round(exactProgress)}%`;

  els.visitedCount.textContent = visited;
  els.photoCount.textContent = photos;
  els.progressPercent.textContent = progress;
}

function renderTravelers() {
  const travelers = getTravelers();
  const activeTraveler = getActiveTraveler();
  els.travelerCount.textContent = cloud.enabled ? travelers.length : 1;
  els.viewModeText.textContent =
    activeOwnerId === "all"
      ? "查看全部旅人的公共足迹"
      : `正在查看 ${activeTraveler?.owner_name || "旅人"} 的点亮地图`;

  const allSummary = getAllTravelersSummary();
  const allCard = `
    <button class="traveler-card ${activeOwnerId === "all" ? "active" : ""}" data-owner-id="all">
      <strong>全部旅人</strong>
      <small>公共聚合地图</small>
      <span class="traveler-metrics">
        <span><i data-lucide="sparkles"></i>${allSummary.visited} 城</span>
        <span><i data-lucide="camera"></i>${allSummary.photos} 张</span>
      </span>
    </button>`;

  const travelerCards = travelers
    .map(
      (traveler) => `
        <button class="traveler-card ${activeOwnerId === traveler.owner_id ? "active" : ""}" data-owner-id="${escapeHtml(traveler.owner_id)}">
          <strong><b class="traveler-dot" style="background:${getTravelerColor(traveler.owner_id)}"></b>${escapeHtml(traveler.owner_name)}${traveler.mine ? "（我）" : ""}</strong>
          <small>${traveler.mine ? "我的足迹地图" : "TA 的足迹地图"}</small>
          <span class="traveler-metrics">
            <span><i data-lucide="sparkles"></i>${traveler.visited} 城</span>
            <span><i data-lucide="camera"></i>${traveler.photos} 张</span>
          </span>
        </button>`,
    )
    .join("");

  els.travelerList.innerHTML = allCard + travelerCards;
  els.travelerList.querySelectorAll(".traveler-card").forEach((button) => {
    button.addEventListener("click", () => {
      activeOwnerId = button.dataset.ownerId;
      selectedId = null;
      renderAll();
      document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderSelectedPlace() {
  const region = selectedId ? getRegion(selectedId) : null;
  if (!region) {
    els.placeCard.innerHTML = `
      <div class="empty-state">
        <i data-lucide="map-pin"></i>
        <h2>点选地图上的地级市</h2>
        <p>${cloudStatusText()}</p>
      </div>`;
    return;
  }

  const record = getRecord(region.id);
  const summary = getRegionSummary(region.id);
  const community = getCommunityRecords(region.id);
  const allPhotos = getRegionPhotos(region.id);
  const isVisited = record.visited;
  const activeTraveler = getActiveTraveler();
  const viewingText = cloud.enabled && activeOwnerId !== "all" ? `正在查看 ${activeTraveler?.owner_name || "旅人"} 的地图` : cloudStatusText();

  const photoTiles = allPhotos.length
    ? allPhotos
        .map((photo) => {
          const canDelete = isOwnPhoto(photo);
          return `
            <figure class="photo-tile">
              <button class="photo-open" data-src="${escapeHtml(photo.src)}" data-caption="${escapeHtml(`${region.name} · ${photo.owner_name || "旅人"}`)}" type="button">
                <img src="${photo.src}" alt="${escapeHtml(region.name)}旅行照片" />
              </button>
              ${canDelete ? `<button class="delete-photo" data-photo-id="${photo.id}" title="删除我的照片"><i data-lucide="trash-2"></i></button>` : ""}
            </figure>`;
        })
        .join("")
    : `<div class="empty-small">还没有照片</div>`;

  const communityHtml = community.length
    ? community
        .map(
          (item) => `
            <div class="community-row ${item.mine ? "mine" : ""}">
              <strong>${escapeHtml(item.owner_name || "旅人")}${item.mine ? "（我）" : ""}</strong>
              <span>${item.visit_date ? escapeHtml(item.visit_date) : "未填日期"} · ${item.photoCount} 张照片</span>
              ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
            </div>`,
        )
        .join("")
    : `<div class="empty-small">还没有人点亮这里</div>`;

  els.placeCard.innerHTML = `
    <div class="place-head">
      <div>
        <p>${escapeHtml(region.province)} · ${escapeHtml(region.kind)}</p>
        <h2>${escapeHtml(region.name)}</h2>
        <p class="meta-line">${viewingText} · ${summary.count} 人点亮</p>
      </div>
      <span class="status-chip ${isVisited ? "on" : ""}">
        <i data-lucide="${isVisited ? "sparkles" : "circle"}"></i>
        ${isVisited ? "我已点亮" : "我未点亮"}
      </span>
    </div>

    <div class="panel-actions">
      <button class="primary-btn" id="toggleVisitedBtn">
        <i data-lucide="${isVisited ? "rotate-ccw" : "badge-check"}"></i>
        ${isVisited ? "取消我的点亮" : "点亮我的足迹"}
      </button>
      <button class="ghost-btn" id="addPhotoBtn">
        <i data-lucide="camera"></i>
        添加我的照片
      </button>
      <button class="ghost-btn" id="clearPlaceBtn">
        <i data-lucide="eraser"></i>
        清空我的记录
      </button>
    </div>

    <div class="fields">
      ${cloud.enabled ? `
        <label>
          我的昵称
          <input id="travelerNameInput" type="text" maxlength="28" value="${escapeHtml(getTravelerName())}" />
        </label>` : ""}
      <label>
        到达日期
        <input id="dateInput" type="date" value="${escapeHtml(record.date || "")}" />
      </label>
      <label>
        旅行备注
        <textarea id="noteInput" maxlength="240" placeholder="写下这座城市的一点记忆">${escapeHtml(record.note || "")}</textarea>
      </label>
    </div>

    <div class="place-photos">${photoTiles}</div>
    <div class="community-list">
      <h3>大家的记录</h3>
      ${communityHtml}
    </div>
  `;

  document.querySelector("#toggleVisitedBtn").addEventListener("click", toggleSelectedVisited);
  document.querySelector("#addPhotoBtn").addEventListener("click", () => els.photoInput.click());
  document.querySelector("#clearPlaceBtn").addEventListener("click", clearSelectedPlace);
  document.querySelector("#dateInput").addEventListener("change", updateSelectedDate);
  document.querySelector("#noteInput").addEventListener("change", updateSelectedNote);
  document.querySelector("#travelerNameInput")?.addEventListener("change", updateTravelerName);
  document.querySelectorAll(".delete-photo").forEach((button) => {
    button.addEventListener("click", () => deletePhoto(button.dataset.photoId));
  });
  document.querySelectorAll("#placeCard .photo-open").forEach((button) => {
    button.addEventListener("click", () => openLightbox(button.dataset.src, button.dataset.caption));
  });
}

function renderList() {
  const provinces = getProvinceProgress();
  els.resultCount.textContent = provinces.length;

  if (!provinces.length) {
    els.placeList.classList.add("province-progress-list");
    els.placeList.innerHTML = `<div class="empty-small">还没有点亮的省份</div>`;
    refreshIcons();
    return;
  }

  els.placeList.classList.add("province-progress-list");
  els.placeList.innerHTML = provinces
    .map((province) => {
      const percent = Math.round((province.visited / province.total) * 100);
      return `
        <button class="province-row" data-province="${escapeHtml(province.name)}">
          <span class="province-row-head">
            <strong>${escapeHtml(province.name)}</strong>
            <b>${percent}%</b>
          </span>
          <span class="province-progress"><i style="width:${percent}%"></i></span>
          <small>${province.visited} / ${province.total} 个城市已点亮${province.photos ? ` · ${province.photos} 张照片` : ""}</small>
        </button>`;
    })
    .join("");

  els.placeList.querySelectorAll(".province-row").forEach((button) => {
    button.addEventListener("click", () => focusProvince(button.dataset.province));
  });
  refreshIcons();
}

function renderGallery() {
  const photos = [];
  for (const region of regions) {
    getRegionPhotos(region.id).forEach((photo) => photos.push({ ...photo, region }));
  }

  els.galleryCount.textContent = photos.length;
  if (!photos.length) {
    els.gallery.innerHTML = `<div class="empty-small">照片会从已点亮的地点汇集到这里</div>`;
    return;
  }

  els.gallery.innerHTML = photos
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(
      (photo) => `
        <button class="gallery-tile photo-open" data-id="${photo.region.id}" data-src="${escapeHtml(photo.src)}" data-caption="${escapeHtml(`${photo.region.name} · ${photo.owner_name || "旅人"}`)}" title="${escapeHtml(photo.region.name)}">
          <img src="${photo.src}" alt="${escapeHtml(photo.region.name)}旅行照片" />
          <span>${escapeHtml(photo.region.name)} · ${escapeHtml(photo.owner_name || "旅人")}</span>
        </button>`,
    )
    .join("");

  els.gallery.querySelectorAll(".gallery-tile").forEach((button) => {
    button.addEventListener("click", () => openLightbox(button.dataset.src, button.dataset.caption));
  });
}

function getFilteredRegions() {
  const query = els.searchInput.value.trim().toLowerCase();
  const province = els.provinceFilter.value;

  return regions
    .filter((region) => {
      const summary = getRegionSummary(region.id);
      if (province && region.province !== province) return false;
      if (listFilter === "visited" && !summary.any) return false;
      if (listFilter === "photos" && !summary.photos) return false;
      if (!query) return true;
      return `${region.name} ${region.province} ${region.kind}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const aSummary = getRegionSummary(a.id);
      const bSummary = getRegionSummary(b.id);
      const aScore = (aSummary.mine ? 4 : 0) + (aSummary.any ? 2 : 0) + (aSummary.photos ? 1 : 0);
      const bScore = (bSummary.mine ? 4 : 0) + (bSummary.any ? 2 : 0) + (bSummary.photos ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
}

function getProvinceProgress() {
  const byProvince = new Map();
  for (const region of regions) {
    const item = byProvince.get(region.province) || {
      name: region.province,
      total: 0,
      visited: 0,
      photos: 0,
    };
    const summary = getRegionSummary(region.id);
    item.total += 1;
    if (summary.any) item.visited += 1;
    item.photos += summary.photos;
    byProvince.set(region.province, item);
  }

  return [...byProvince.values()]
    .filter((province) => province.visited > 0)
    .sort((a, b) => b.visited / b.total - a.visited / a.total || b.visited - a.visited || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function focusProvince(province) {
  els.provinceFilter.value = province;
  selectedId = null;
  const bounds = [];
  if (regionLayer) {
    regionLayer.eachLayer((layer) => {
      if (layer.feature.properties.province === province) {
        bounds.push(layer.getBounds());
      }
    });
  }
  if (bounds.length) {
    const merged = bounds.reduce((acc, item) => acc.extend(item), bounds[0]);
    map.fitBounds(merged, { padding: [55, 55], maxZoom: 7 });
  }
  renderAll();
}

function selectRegion(id, zoomTo) {
  selectedId = id;
  if (zoomTo && regionLayer) {
    regionLayer.eachLayer((layer) => {
      if (layer.feature.properties.id === id) {
        map.fitBounds(layer.getBounds(), { padding: [70, 70], maxZoom: 8 });
        layer.bringToFront();
      }
    });
  }
  renderAll();
}

async function toggleSelectedVisited() {
  if (!selectedId) return;
  if (cloud.enabled) {
    const record = getMyCloudFootprint(selectedId);
    if (record?.visited) {
      await updateCloudFootprint(selectedId, { visited: false });
    } else {
      await updateCloudFootprint(selectedId, { visited: true });
    }
    await loadCloudData();
    renderAll();
    return;
  }

  const record = ensureRecord(selectedId);
  record.visited = !record.visited;
  persistAndRender();
}

async function updateSelectedDate(event) {
  if (!selectedId) return;
  if (cloud.enabled) {
    await updateCloudFootprint(selectedId, { visit_date: event.target.value || null, visited: true });
    await loadCloudData();
    renderAll();
    return;
  }

  const record = ensureRecord(selectedId);
  record.date = event.target.value;
  if (record.date) record.visited = true;
  persistAndRender({ keepFocus: true });
}

async function updateSelectedNote(event) {
  if (!selectedId) return;
  if (cloud.enabled) {
    await updateCloudFootprint(selectedId, { note: event.target.value, visited: true });
    await loadCloudData();
    renderAll();
    return;
  }

  const record = ensureRecord(selectedId);
  record.note = event.target.value;
  if (record.note.trim()) record.visited = true;
  persistAndRender({ keepFocus: true });
}

async function clearSelectedPlace() {
  if (!selectedId) return;
  if (cloud.enabled) {
    await clearMyCloudPlace(selectedId);
    await loadCloudData();
    renderAll();
    return;
  }

  delete state.records[selectedId];
  persistAndRender();
}

async function clearAllMyRecords() {
  const message = cloud.enabled
    ? "确定清空你自己的所有足迹、备注和照片吗？其他人的记录不会被删除。"
    : "确定清空本机保存的所有足迹、备注和照片吗？";
  if (!window.confirm(message)) return;

  if (cloud.enabled) {
    activeOwnerId = cloud.user.id;
    const minePhotos = cloud.photos.filter((photo) => photo.owner_id === cloud.user.id);
    const paths = minePhotos.map((photo) => photo.storage_path).filter(Boolean);
    if (paths.length) {
      const storageResult = await cloud.client.storage.from(PHOTO_BUCKET).remove(paths);
      if (storageResult.error) return alert(`照片文件删除失败：${storageResult.error.message}`);
    }

    const photosResult = await cloud.client.from("photos").delete().eq("owner_id", cloud.user.id);
    if (photosResult.error) return alert(`照片记录删除失败：${photosResult.error.message}`);

    const footprintsResult = await cloud.client.from("footprints").delete().eq("owner_id", cloud.user.id);
    if (footprintsResult.error) return alert(`足迹删除失败：${footprintsResult.error.message}`);

    selectedId = null;
    await loadCloudData();
    renderAll();
    return;
  }

  state.records = {};
  selectedId = null;
  saveState();
  renderAll();
}

async function handlePhotoUpload(event) {
  if (!selectedId) return;
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;

  if (cloud.enabled) {
    for (const file of files) {
      await uploadCloudPhoto(selectedId, file);
    }
    event.target.value = "";
    await loadCloudData();
    renderAll();
    return;
  }

  const record = ensureRecord(selectedId);
  record.visited = true;
  for (const file of files) {
    const src = await compressImage(file);
    record.photos.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name: file.name,
      src,
      createdAt: Date.now(),
    });
  }

  event.target.value = "";
  persistAndRender();
}

async function deletePhoto(photoId) {
  if (cloud.enabled) {
    const photo = cloud.photos.find((item) => item.id === photoId);
    if (!photo || !isOwnPhoto(photo)) return;
    activeOwnerId = cloud.user.id;
    if (photo.storage_path) await cloud.client.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
    const { error } = await cloud.client.from("photos").delete().eq("id", photoId).eq("owner_id", cloud.user.id);
    if (error) return alert(`删除失败：${error.message}`);
    await loadCloudData();
    renderAll();
    return;
  }

  const record = ensureRecord(selectedId);
  record.photos = record.photos.filter((photo) => photo.id !== photoId);
  persistAndRender();
}

function refreshMapStyles() {
  if (!regionLayer) return;
  regionLayer.eachLayer((layer) => {
    layer.setStyle(styleForFeature(layer.feature));
    if (layer.feature.properties.id === selectedId) layer.bringToFront();
  });
}

function refreshPhotoMarkers() {
  if (!photoMarkerLayer || !regionLayer) return;
  photoMarkerLayer.clearLayers();

  regionLayer.eachLayer((layer) => {
    const id = layer.feature.properties.id;
    const summary = getRegionSummary(id);
    if (!summary.photos) return;

    const marker = L.marker(layer.getBounds().getCenter(), {
      icon: L.divIcon({
        className: "",
        html: `<div class="photo-marker"><i data-lucide="camera"></i></div>`,
        iconSize: [27, 27],
        iconAnchor: [13, 13],
      }),
    });
    marker.on("click", () => selectRegion(id, true));
    marker.addTo(photoMarkerLayer);
  });
}

async function loadCloudData() {
  if (!cloud.enabled) return;

  const footprintsResult = await cloud.client.from("footprints").select("*").order("created_at", { ascending: false });
  if (footprintsResult.error) throw footprintsResult.error;
  const photosResult = await cloud.client.from("photos").select("*").order("created_at", { ascending: false });
  if (photosResult.error) throw photosResult.error;

  cloud.footprints = footprintsResult.data || [];
  cloud.photos = (photosResult.data || []).map((photo) => ({
    id: photo.id,
    region_id: photo.region_id,
    owner_id: photo.owner_id,
    owner_name: photo.owner_name,
    src: photo.public_url,
    storage_path: photo.storage_path,
    createdAt: new Date(photo.created_at).getTime(),
  }));
  if (activeOwnerId !== "all" && !getTravelers().some((traveler) => traveler.owner_id === activeOwnerId)) {
    activeOwnerId = "all";
  }
  renderAll();
}

async function updateCloudFootprint(regionId, patch) {
  const region = getRegion(regionId);
  if (!region || !cloud.user) return;
  activeOwnerId = cloud.user.id;

  const payload = {
    owner_id: cloud.user.id,
    owner_name: getTravelerName(),
    region_id: region.id,
    region_name: region.name,
    province: region.province,
    kind: region.kind,
    ...patch,
  };

  const { error } = await cloud.client.from("footprints").upsert(payload, { onConflict: "owner_id,region_id" });
  if (error) alert(`保存失败：${error.message}`);
}

async function uploadCloudPhoto(regionId, file) {
  const compressed = await compressImage(file);
  await updateCloudFootprint(regionId, { visited: true });

  const blob = dataUrlToBlob(compressed);
  const safeName = file.name.replace(/[^\w.-]+/g, "-").slice(-80) || "photo.jpg";
  const path = `${cloud.user.id}/${Date.now()}-${safeName}`;
  const upload = await cloud.client.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (upload.error) return alert(`照片上传失败：${upload.error.message}`);

  const publicUrl = cloud.client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  const region = getRegion(regionId);
  const insert = await cloud.client.from("photos").insert({
    owner_id: cloud.user.id,
    owner_name: getTravelerName(),
    region_id: region.id,
    region_name: region.name,
    storage_path: path,
    public_url: publicUrl,
  });
  if (insert.error) alert(`照片记录保存失败：${insert.error.message}`);
}

async function clearMyCloudPlace(regionId) {
  activeOwnerId = cloud.user.id;
  const mine = cloud.photos.filter((photo) => photo.region_id === regionId && photo.owner_id === cloud.user.id);
  const paths = mine.map((photo) => photo.storage_path).filter(Boolean);
  if (paths.length) await cloud.client.storage.from(PHOTO_BUCKET).remove(paths);
  await cloud.client.from("photos").delete().eq("owner_id", cloud.user.id).eq("region_id", regionId);
  await cloud.client.from("footprints").delete().eq("owner_id", cloud.user.id).eq("region_id", regionId);
}

async function updateTravelerName(event) {
  const name = event.target.value.trim() || ensureTravelerName();
  localStorage.setItem(NAME_KEY, name);
  if (!cloud.enabled) return;
  await cloud.client.from("footprints").update({ owner_name: name }).eq("owner_id", cloud.user.id);
  await cloud.client.from("photos").update({ owner_name: name }).eq("owner_id", cloud.user.id);
  await loadCloudData();
  renderAll();
}

function getRegionSummary(regionId) {
  if (cloud.enabled) {
    const rows = getScopedFootprints().filter((item) => item.region_id === regionId && item.visited);
    const photos = getScopedPhotos().filter((item) => item.region_id === regionId);
    return {
      any: rows.length > 0 || photos.length > 0,
      mine: rows.some((item) => item.owner_id === cloud.user?.id),
      photos: photos.length,
      count: rows.length,
    };
  }

  const record = getRecord(regionId);
  return {
    any: record.visited || record.photos.length > 0,
    mine: record.visited,
    photos: record.photos.length,
    count: record.visited ? 1 : 0,
  };
}

function getRecord(id) {
  if (cloud.enabled) {
    const row = getMyCloudFootprint(id);
    const photos = cloud.photos
      .filter((photo) => photo.region_id === id && photo.owner_id === cloud.user?.id)
      .map((photo) => ({ ...photo, createdAt: photo.createdAt || 0 }));
    return {
      visited: Boolean(row?.visited),
      date: row?.visit_date || "",
      note: row?.note || "",
      photos,
    };
  }

  return state.records[id] || { visited: false, date: "", note: "", photos: [] };
}

function getMyCloudFootprint(regionId) {
  return cloud.footprints.find((item) => item.region_id === regionId && item.owner_id === cloud.user?.id);
}

function getRegionPhotos(regionId) {
  if (cloud.enabled) return getScopedPhotos().filter((photo) => photo.region_id === regionId);
  return getRecord(regionId).photos;
}

function getCommunityRecords(regionId) {
  if (!cloud.enabled) {
    const local = getRecord(regionId);
    if (!local.visited && !local.photos.length && !local.note) return [];
    return [{ owner_name: "我", visit_date: local.date, note: local.note, photoCount: local.photos.length, mine: true }];
  }

  return getScopedFootprints()
    .filter((item) => item.region_id === regionId && (item.visited || item.note || item.visit_date))
    .map((item) => ({
      ...item,
      mine: item.owner_id === cloud.user?.id,
      photoCount: cloud.photos.filter((photo) => photo.region_id === regionId && photo.owner_id === item.owner_id).length,
    }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || new Date(b.created_at) - new Date(a.created_at));
}

function getScopedFootprints() {
  if (!cloud.enabled || activeOwnerId === "all") return cloud.footprints;
  return cloud.footprints.filter((item) => item.owner_id === activeOwnerId);
}

function getScopedPhotos() {
  if (!cloud.enabled || activeOwnerId === "all") return cloud.photos;
  return cloud.photos.filter((item) => item.owner_id === activeOwnerId);
}

function getTravelers() {
  if (!cloud.enabled) {
    const localVisited = Object.values(state.records).filter((record) => record.visited).length;
    const localPhotos = Object.values(state.records).reduce((sum, record) => sum + record.photos.length, 0);
    return [{ owner_id: "local", owner_name: "我", visited: localVisited, photos: localPhotos, mine: true }];
  }

  const travelers = new Map();
  for (const footprint of cloud.footprints) {
    const item = travelers.get(footprint.owner_id) || {
      owner_id: footprint.owner_id,
      owner_name: footprint.owner_name || "旅人",
      visitedRegions: new Set(),
      photos: 0,
      mine: footprint.owner_id === cloud.user?.id,
    };
    item.owner_name = footprint.owner_name || item.owner_name;
    if (footprint.visited) item.visitedRegions.add(footprint.region_id);
    travelers.set(footprint.owner_id, item);
  }

  for (const photo of cloud.photos) {
    const item = travelers.get(photo.owner_id) || {
      owner_id: photo.owner_id,
      owner_name: photo.owner_name || "旅人",
      visitedRegions: new Set(),
      photos: 0,
      mine: photo.owner_id === cloud.user?.id,
    };
    item.owner_name = photo.owner_name || item.owner_name;
    item.photos += 1;
    travelers.set(photo.owner_id, item);
  }

  if (cloud.user?.id && !travelers.has(cloud.user.id)) {
    travelers.set(cloud.user.id, {
      owner_id: cloud.user.id,
      owner_name: getTravelerName(),
      visitedRegions: new Set(),
      photos: 0,
      mine: true,
    });
  }

  return [...travelers.values()]
    .map((item) => ({ ...item, visited: item.visitedRegions.size }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.visited - a.visited || b.photos - a.photos || a.owner_name.localeCompare(b.owner_name, "zh-Hans-CN"));
}

function getActiveTraveler() {
  return getTravelers().find((traveler) => traveler.owner_id === activeOwnerId);
}

function getAllTravelersSummary() {
  if (cloud.enabled) {
    return {
      visited: new Set(cloud.footprints.filter((item) => item.visited).map((item) => item.region_id)).size,
      photos: cloud.photos.length,
    };
  }

  return {
    visited: Object.values(state.records).filter((record) => record.visited).length,
    photos: Object.values(state.records).reduce((sum, record) => sum + record.photos.length, 0),
  };
}

function getRegionFillColor(regionId, summary) {
  if (!summary.any) return "#fff6df";
  if (!cloud.enabled) return "#f2a23a";
  const ownerIds = [...new Set(getScopedFootprints().filter((item) => item.region_id === regionId && item.visited).map((item) => item.owner_id))];
  if (activeOwnerId !== "all") return getTravelerColor(activeOwnerId);
  if (ownerIds.length === 1) return getTravelerColor(ownerIds[0]);
  if (ownerIds.length > 1) return "#d85f47";
  const photoOwner = getScopedPhotos().find((photo) => photo.region_id === regionId)?.owner_id;
  return photoOwner ? getTravelerColor(photoOwner) : "#52b788";
}

function getTravelerColor(ownerId) {
  if (!ownerId || ownerId === "all") return "#087a75";
  let hash = 0;
  for (let i = 0; i < ownerId.length; i += 1) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) >>> 0;
  }
  return TRAVELER_COLORS[hash % TRAVELER_COLORS.length];
}

function shadeColor(hex, percent) {
  const value = hex.replace("#", "");
  const num = parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
  const amount = Math.round(2.55 * percent);
  const red = Math.max(0, Math.min(255, (num >> 16) + amount));
  const green = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const blue = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${(0x1000000 + red * 0x10000 + green * 0x100 + blue).toString(16).slice(1)}`;
}

function isOwnPhoto(photo) {
  return !cloud.enabled || photo.owner_id === cloud.user?.id;
}

function cloudStatusText() {
  if (cloud.enabled) return "云同步已开启，大家可见，只能编辑自己的记录";
  if (cloud.error) return `云同步未开启：${cloud.error}`;
  return "当前是本地模式；配置 Supabase 后可多人共享";
}

function ensureRecord(id) {
  if (!state.records[id]) state.records[id] = { visited: false, date: "", note: "", photos: [] };
  if (!Array.isArray(state.records[id].photos)) state.records[id].photos = [];
  return state.records[id];
}

function getRegion(id) {
  return regions.find((region) => region.id === id);
}

function bindCityLabel(layer) {
  const label = getLabelText(layer.feature);
  const tooltip = layer.getTooltip();
  if (!label) {
    if (tooltip) layer.unbindTooltip();
    return;
  }
  if (tooltip && tooltip.getContent() === label) return;
  if (tooltip) layer.unbindTooltip();
  layer.bindTooltip(label, {
    permanent: true,
    direction: "center",
    className: "city-label",
    opacity: 0.88,
  });
}

function cycleLabelMode() {
  const currentIndex = LABEL_MODES.indexOf(state.labelMode);
  state.labelMode = LABEL_MODES[(currentIndex + 1) % LABEL_MODES.length];
  saveState();
  applyLabelVisibility();
}

function applyLabelVisibility() {
  const mode = normalizeLabelMode(state.labelMode);
  state.labelMode = mode;
  document.body.classList.toggle("labels-hidden", mode === "none");
  if (regionLayer) regionLayer.eachLayer((layer) => bindCityLabel(layer));

  const modeText = mode === "key" ? "重点名称" : mode === "all" ? "全部名称" : "隐藏名称";
  const icon = mode === "none" ? "eye-off" : mode === "all" ? "tags" : "tag";
  els.toggleLabelsBtn.title = `标注：${modeText}，点击切换`;
  els.toggleLabelsBtn.setAttribute("aria-label", `城市标注：${modeText}`);
  els.toggleLabelsBtn.innerHTML = `<i data-lucide="${icon}"></i>`;
  els.mapLabelToggleBtn.classList.toggle("active", mode !== "none");
  els.mapLabelToggleBtn.setAttribute("aria-label", `城市标注：${modeText}`);
  els.mapLabelToggleBtn.innerHTML = `<i data-lucide="${icon}"></i>${modeText}`;
  refreshIcons();
}

function getLabelText(feature) {
  const { code, name, province } = feature.properties;
  if (state.labelMode === "none") return "";
  if (state.labelMode === "all") return name;
  if (province === "香港特别行政区") return code === "810000" ? "香港" : "";
  if (province === "澳门特别行政区") return code === "820000" ? "澳门" : "";
  if (KEY_LABEL_NAMES.has(name)) return name;
  return "";
}

function normalizeLabelMode(mode) {
  return LABEL_MODES.includes(mode) ? mode : "key";
}

function exportData() {
  const payload = {
    app: "china-travel-footprints",
    version: 2,
    exportedAt: new Date().toISOString(),
    labelMode: normalizeLabelMode(state.labelMode),
    records: state.records,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `china-travel-footprints-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function openLightbox(src, caption = "") {
  if (!src) return;
  els.lightboxImage.src = src;
  els.lightboxCaption.textContent = caption;
  els.lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  refreshIcons();
}

function closeLightbox() {
  els.lightbox.hidden = true;
  els.lightboxImage.removeAttribute("src");
  els.lightboxCaption.textContent = "";
  document.body.classList.remove("lightbox-open");
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const records = data.records || data;
      if (!records || typeof records !== "object") throw new Error("Invalid data");
      state.records = records;
      state.labelMode = data.labelMode ? normalizeLabelMode(data.labelMode) : data.labelsHidden ? "none" : "key";
      selectedId = null;
      saveState();
      renderAll();
    } catch (error) {
      alert("导入失败，请选择此前导出的 JSON 文件。");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function persistAndRender(options = {}) {
  try {
    saveState();
  } catch (error) {
    alert("本地存储空间不足，请先导出备份或减少照片数量。");
  }
  if (options.keepFocus) {
    renderStats();
    refreshMapStyles();
    refreshPhotoMarkers();
    renderList();
    renderGallery();
    refreshIcons();
    return;
  }
  renderAll();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { records: {}, labelMode: "key" };
    const parsed = JSON.parse(raw);
    const labelMode = parsed.labelMode ? normalizeLabelMode(parsed.labelMode) : parsed.labelsHidden ? "none" : "key";
    return { records: parsed.records || {}, labelMode };
  } catch {
    return { records: {}, labelMode: "key" };
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function ensureTravelerName() {
  const existing = localStorage.getItem(NAME_KEY);
  if (existing) return existing;
  const suffix = cloud.user?.id ? cloud.user.id.slice(0, 4).toUpperCase() : Math.random().toString(36).slice(2, 6).toUpperCase();
  const name = `旅人-${suffix}`;
  localStorage.setItem(NAME_KEY, name);
  return name;
}

function getTravelerName() {
  return localStorage.getItem(NAME_KEY) || ensureTravelerName();
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { "stroke-width": 2.2 } });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
