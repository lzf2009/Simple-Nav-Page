/* ===================================================
 *  Simple Nav Page - 主逻辑脚本
 *  包含功能：
 *    - 随机背景图
 *    - 搜索引擎切换与搜索
 *    - 站内链接过滤（基于 links.json）
 *    - 图标获取代理配置
 *    - 内外网切换（预留接口）
 * =================================================== */

// ========== 基础配置 ==========
/** 图标源：'google' 或 'duckduckgo' */
const FAVICON_PROVIDER = 'duckduckgo';

/** 图标代理地址，解决国内访问缓慢 */
const PROXY = 'https://sim.1546879868.workers.dev';

/** 自定义图标本地路径前缀 */
const SITE_ICON_BASE = location.origin + location.pathname.replace(/\/[^/]*$/, '') + '/icons/logos/';

// ========== 搜索引擎列表 ==========
/**
 * 已移除百度、搜狗、360，新增 GitHub
 * 每个引擎需提供 name, icon, searchUrl (用 {query} 占位), type
 */
const searchEngines = [
  {
    name: 'GitHub',
    icon: 'https://github.com/favicon.ico',
    searchUrl: 'https://github.com/search?q={query}',
    type: 'web'
  },
  {
    name: 'Google',
    icon: 'https://www.google.com/favicon.ico',
    searchUrl: 'https://www.google.com/search?q={query}',
    type: 'web'
  },
  {
    name: 'Bing',
    icon: 'https://www.bing.com/favicon.ico',
    searchUrl: 'https://www.bing.com/search?q={query}',
    type: 'web'
  },
  {
    name: 'DuckDuckGo',
    icon: 'https://duckduckgo.com/favicon.ico',
    searchUrl: 'https://duckduckgo.com/?q={query}',
    type: 'web'
  }
];

// ========== 当前状态 ==========
let currentEngineIndex = 0;           // 当前选中的搜索引擎索引
let linksData = [];                   // 从 links.json 加载的站点数据（现为空）

// ========== 工具函数 ==========
/**
 * HTML 安全转义，防 XSS
 */
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 从 URL 提取域名
 */
function getDomain(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}

/**
 * 根据配置生成 favicon 地址（自动走代理）
 */
function buildFaviconUrl(domain) {
  if (!domain) {
    // 无域名时返回默认地球图标（base64 SVG）
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PHBhdGggZD0iTTIgMTJoMjAiLz48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMCAxNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiLz48L3N2Zz4=';
  }
  let url;
  if (FAVICON_PROVIDER === 'google') {
    url = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
  } else {
    url = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  }
  // 添加代理前缀
  if (PROXY) {
    url = PROXY + '/' + url.replace(/^https?:\/\//, '');
  }
  return url;
}

// ========== 搜索引擎面板渲染 ==========
function renderEnginePanel() {
  const panel = document.getElementById('enginePanel');
  panel.innerHTML = searchEngines.map((engine, idx) => {
    const active = idx === currentEngineIndex;
    return `
      <div class="engine-item ${active ? 'active' : ''}" onclick="switchEngine(${idx})" title="${esc(engine.name)}">
        <img src="${esc(engine.icon)}" alt="${esc(engine.name)}" onerror="this.style.display='none'">
        <span>${esc(engine.name)}</span>
        ${active ? '<span class="check-mark">✓</span>' : ''}
      </div>`;
  }).join('');
}

function switchEngine(index) {
  currentEngineIndex = index;
  updateCurrentEngineDisplay();
  renderEnginePanel();
  toggleEnginePanel(false);
  document.getElementById('searchInput').focus();
}

function toggleEnginePanel(force) {
  const panel = document.getElementById('enginePanel');
  const hidden = panel.style.display === 'none';
  panel.style.display = (typeof force === 'boolean') ? (force ? 'block' : 'none') : (hidden ? 'block' : 'none');
}

function updateCurrentEngineDisplay() {
  const engine = searchEngines[currentEngineIndex];
  document.getElementById('search-engine-icon').src = engine.icon;
  document.getElementById('search-engine-icon').alt = engine.name;
  document.getElementById('engineName').textContent = engine.name;
}

// ========== 搜索功能 ==========
function doSearch() {
  const input = document.getElementById('searchInput');
  const query = input.value.trim();
  if (!query) { input.focus(); return; }
  const engine = searchEngines[currentEngineIndex];
  const url = engine.searchUrl.replace('{query}', encodeURIComponent(query));
  window.open(url, '_blank');
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  filterLinks();
  document.getElementById('clearBtn').style.display = 'none';
  input.focus();
}

// ========== 链接过滤与渲染 ==========
function filterLinks() {
  const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
  document.getElementById('clearBtn').style.display = keyword.length > 0 ? 'flex' : 'none';
  renderFilteredLinks(keyword);
}

function renderFilteredLinks(keyword) {
  const container = document.getElementById('main-content');
  
  // 如果 linksData 为空，直接隐藏整个链接区域
  if (!linksData || linksData.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block'; // 有数据时显示

  // 过滤匹配的链接
  const filtered = linksData.map(sec => {
    const items = sec.items.filter(item => {
      if (!keyword) return true;
      const s = (item.title + item.desc + (item['data-desc'] || '')).toLowerCase();
      return s.includes(keyword);
    });
    return { ...sec, items };
  }).filter(sec => sec.items.length > 0);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">没有匹配的链接</div>';
    return;
  }

  let html = '';
  filtered.forEach(sec => {
    html += `<div class="section"><h2 class="section-title">${esc(sec.section)}</h2><div class="links-grid">`;
    sec.items.forEach(item => {
      const domain = getDomain(item.url);
      let icon = '';
      if (item.icon) {
        const name = item.icon.replace(/^.*\//, '');
        icon = SITE_ICON_BASE + name;
      } else if (domain) {
        icon = buildFaviconUrl(domain);
      } else {
        icon = buildFaviconUrl('');
      }
      const intranet = item.intranet || '';
      html += `
        <a class="link-card" href="${esc(item.url)}" target="_blank" title="${esc(item.desc || '')}">
          <img class="link-icon" src="${icon}" alt="" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PHBhdGggZD0iTTIgMTJoMjAiLz48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMCAxNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiLz48L3N2Zz4='">
          <span class="link-title">${esc(item.title)}</span>
          ${intranet ? '<span class="intranet-tag">内网</span>' : ''}
        </a>`;
    });
    html += `</div></div>`;
  });
  container.innerHTML = html;
}

// ========== 内外网切换（预留） ==========
let isIntranet = false;
function toggleIntranet() {
  isIntranet = !isIntranet;
  filterLinks();
}

// ========== 随机背景图 ==========
function setRandomBackground() {
  const list = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80',
    'https://images.unsplash.com/photo-1500964757637-c85e8a162699?w=1920&q=80',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&q=80',
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80'
  ];
  const url = list[Math.floor(Math.random() * list.length)];
  document.getElementById('bgLayer').style.backgroundImage = `url(${url})`;
}

// ========== 加载链接数据 ==========
async function loadLinksData() {
  try {
    const res = await fetch('links.json');
    if (!res.ok) throw new Error('加载失败');
    linksData = await res.json();
  } catch (e) {
    console.warn('links.json 不可用，页面将只保留搜索功能', e);
    linksData = [];
  }
  filterLinks();
}

// ========== 事件绑定 ==========
function bindEvents() {
  document.getElementById('engineTrigger').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEnginePanel();
  });
  document.addEventListener('click', () => toggleEnginePanel(false));
  document.getElementById('enginePanel').addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

// ========== 初始化 ==========
async function init() {
  setRandomBackground();
  renderEnginePanel();
  updateCurrentEngineDisplay();
  await loadLinksData();
  bindEvents();
  const input = document.getElementById('searchInput');
  document.getElementById('clearBtn').style.display = input.value.trim() ? 'flex' : 'none';
}

init();
