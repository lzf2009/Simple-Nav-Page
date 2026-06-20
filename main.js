/* ===========================================================================
 *  Simple Nav Page - 主逻辑脚本（优化版）
 *  功能：
 *    - 随机高清背景图
 *    - 可切换搜索引擎（已移除百度/搜狗/360，新增 GitHub，默认 Bing）
 *    - 站内链接动态过滤与展示（links.json 为空时完全隐藏链接区域）
 *    - 图标自动获取与代理
 *    - 内外网切换（预留功能）
 *    - 所有数据均支持后台编辑，无需手动改代码
 * =========================================================================== */

// ======================== 基础配置 ========================

/**
 * 图标来源：'duckduckgo' 或 'google'
 * 决定自动获取 favicon 的 API
 */
const FAVICON_PROVIDER = 'duckduckgo';

/**
 * 图标代理地址（Cloudflare Worker），解决国内网络下图标加载缓慢/失败的问题。
 * 留空则不使用代理。
 */
const PROXY = 'https://sim.1546879868.workers.dev';

/**
 * 自定义图标的基础路径，与后台图标管理保持一致
 */
const SITE_ICON_BASE = location.origin + location.pathname.replace(/\/[^/]*$/, '') + '/icons/logos/';


// ======================== 搜索引擎配置 ========================

/**
 * 搜索引擎列表
 * 每个对象包含：
 *   name      - 显示名称
 *   icon      - 引擎图标 URL
 *   searchUrl - 搜索接口，{query} 会被替换为编码后的搜索词
 *   type      - 引擎类型，可用于分类（当前仅作保留字段）
 *
 * 注意：已移除百度、搜狗、360 搜索，新增 GitHub
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


// ======================== 全局状态 ========================

/** 当前选中的搜索引擎索引，默认 Bing (索引 2) */
let currentEngineIndex = 2;

/** 从 links.json 加载的完整数据，初始为空数组 */
let linksData = [];

/** 是否处于内网模式（预留） */
let isIntranet = false;


// ======================== 工具函数 ========================

/**
 * HTML 安全转义，防止 XSS 攻击
 * @param {string} str - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
function esc(str) {
  if (!str) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  };
  return str.replace(/[&<>"]/g, char => map[char]);
}

/**
 * 从完整 URL 中提取域名（hostname）
 * @param {string} url
 * @returns {string} 域名，解析失败则返回空字符串
 */
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
}

/**
 * 根据当前配置生成网站图标 URL
 * @param {string} domain - 网站域名
 * @returns {string} 图标的完整 URL
 */
function buildFaviconUrl(domain) {
  if (!domain) {
    // 默认地球图标（Base64 内联 SVG）
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PHBhdGggZD0iTTIgMTJoMjAiLz48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMCAxNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiLz48L3N2Zz4=';
  }

  let url;
  if (FAVICON_PROVIDER === 'google') {
    url = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
  } else {
    url = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  }

  // 如果配置了代理，则添加代理前缀
  if (PROXY) {
    url = PROXY + '/' + url.replace(/^https?:\/\//, '');
  }
  return url;
}


// ======================== 搜索引擎面板 ========================

/**
 * 渲染搜索引擎选择面板（内联在搜索框下方）
 */
function renderEnginePanel() {
  const panel = document.getElementById('enginePanel');
  if (!panel) return;

  panel.innerHTML = searchEngines.map((engine, index) => {
    const isActive = index === currentEngineIndex;
    return `
      <div class="engine-item ${isActive ? 'active' : ''}"
           onclick="switchEngine(${index})"
           title="${esc(engine.name)}">
        <img src="${esc(engine.icon)}" alt="${esc(engine.name)}" onerror="this.style.display='none'">
        <span>${esc(engine.name)}</span>
        ${isActive ? '<span class="check-mark">✓</span>' : ''}
      </div>`;
  }).join('');
}

/**
 * 切换当前搜索引擎
 * @param {number} index - 搜索引擎在 searchEngines 数组中的索引
 */
function switchEngine(index) {
  if (index === currentEngineIndex) return;
  currentEngineIndex = index;
  updateCurrentEngineDisplay();
  renderEnginePanel();
  // 切换后自动关闭面板，聚焦搜索框
  toggleEnginePanel(false);
  document.getElementById('searchInput').focus();
}

/**
 * 切换引擎面板的显示/隐藏状态
 * @param {boolean} [force] - true 强制显示，false 强制隐藏，不传则切换
 */
function toggleEnginePanel(force) {
  const panel = document.getElementById('enginePanel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  if (typeof force === 'boolean') {
    panel.style.display = force ? 'block' : 'none';
  } else {
    panel.style.display = isHidden ? 'block' : 'none';
  }
}

/**
 * 更新搜索框左侧显示的当前引擎图标和名称
 */
function updateCurrentEngineDisplay() {
  const engine = searchEngines[currentEngineIndex];
  const iconEl = document.getElementById('search-engine-icon');
  const nameEl = document.getElementById('engineName');
  if (iconEl) {
    iconEl.src = engine.icon;
    iconEl.alt = engine.name;
  }
  if (nameEl) nameEl.textContent = engine.name;
}


// ======================== 搜索功能 ========================

/**
 * 执行搜索：使用当前选中的引擎，在新标签页打开搜索结果
 */
function doSearch() {
  const input = document.getElementById('searchInput');
  const query = input.value.trim();
  if (!query) {
    input.focus();
    return;
  }
  const engine = searchEngines[currentEngineIndex];
  const searchUrl = engine.searchUrl.replace('{query}', encodeURIComponent(query));
  window.open(searchUrl, '_blank');
}

/**
 * 清空搜索输入框，并重置站内链接过滤状态
 */
function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  filterLinks();
  document.getElementById('clearBtn').style.display = 'none';
  input.focus();
}


// ======================== 站内链接过滤与渲染 ========================

/**
 * 根据搜索框关键词过滤站内链接（无链接时自动隐藏区域）
 */
function filterLinks() {
  const input = document.getElementById('searchInput');
  const keyword = input.value.trim().toLowerCase();
  const clearBtn = document.getElementById('clearBtn');
  // 控制清空按钮显隐
  clearBtn.style.display = keyword.length > 0 ? 'flex' : 'none';

  renderFilteredLinks(keyword);
}

/**
 * 核心渲染函数：根据关键词过滤 linksData 并生成 HTML
 * @param {string} keyword - 过滤关键词（已小写化）
 */
function renderFilteredLinks(keyword) {
  const container = document.getElementById('main-content');
  if (!container) return;

  // 如果没有任何链接数据，完全隐藏整个区域，不留任何文字
  if (!linksData || linksData.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  // 有数据时，先显示容器，再生成内容
  container.style.display = 'block';

  // 按分类过滤匹配项
  const filteredSections = linksData.map(section => {
    const filteredItems = section.items.filter(item => {
      if (!keyword) return true;
      const title = (item.title || '').toLowerCase();
      const desc = (item.desc || '').toLowerCase();
      const dataDesc = (item['data-desc'] || '').toLowerCase();
      return title.includes(keyword) || desc.includes(keyword) || dataDesc.includes(keyword);
    });
    return { ...section, items: filteredItems };
  }).filter(section => section.items.length > 0);

  // 无匹配结果时显示提示
  if (filteredSections.length === 0) {
    container.innerHTML = '<div class="empty-state">没有找到匹配的链接</div>';
    return;
  }

  // 构建 HTML
  let html = '';
  filteredSections.forEach(section => {
    html += `<div class="section"><h2 class="section-title">${esc(section.section)}</h2><div class="links-grid">`;
    section.items.forEach(item => {
      const domain = getDomain(item.url);
      let iconUrl;
      if (item.icon) {
        // 自定义图标
        const iconName = item.icon.replace(/^.*\//, '');
        iconUrl = SITE_ICON_BASE + iconName;
      } else if (domain) {
        iconUrl = buildFaviconUrl(domain);
      } else {
        iconUrl = buildFaviconUrl('');
      }

      // 内网标记（预留）
      const intranetTag = item.intranet ? '<span class="intranet-tag" title="内网地址">内网</span>' : '';

      html += `
        <a class="link-card" href="${esc(item.url)}" target="_blank" title="${esc(item.desc || '')}">
          <img class="link-icon" src="${iconUrl}" alt="" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PHBhdGggZD0iTTIgMTJoMjAiLz48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMCAxNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiLz48L3N2Zz4=';">
          <span class="link-title">${esc(item.title)}</span>
          ${intranetTag}
        </a>`;
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;
}


// ======================== 内外网切换（预留功能） ========================

function toggleIntranet() {
  isIntranet = !isIntranet;
  filterLinks();
  // 实际使用时，link-card 的 href 会根据 isIntranet 决定使用 url 还是 intranet
}


// ======================== 随机背景图 ========================

/**
 * 从 Unsplash 的精选壁纸中随机选择一张作为背景
 */
function setRandomBackground() {
  const backgrounds = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80',
    'https://images.unsplash.com/photo-1500964757637-c85e8a162699?w=1920&q=80',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&q=80',
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80'
  ];
  const bgUrl = backgrounds[Math.floor(Math.random() * backgrounds.length)];
  document.getElementById('bgLayer').style.backgroundImage = `url(${bgUrl})`;
}


// ======================== 数据加载 ========================

/**
 * 加载 links.json 并初始化页面
 */
async function loadLinksData() {
  try {
    const response = await fetch('links.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    linksData = await response.json();
    if (!Array.isArray(linksData)) linksData = [];
  } catch (error) {
    console.warn('无法加载 links.json，页面将只显示搜索功能。可通过后台重新添加链接。', error);
    linksData = [];
  }
  filterLinks();  // 初始渲染
}


// ======================== 事件绑定 ========================

function bindEvents() {
  // 引擎触发器：点击展开/关闭面板
  document.getElementById('engineTrigger').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEnginePanel();
  });

  // 点击页面任意位置关闭引擎面板（排除面板自身）
  document.addEventListener('click', () => toggleEnginePanel(false));
  document.getElementById('enginePanel').addEventListener('click', (e) => e.stopPropagation());

  // 回车键快速搜索
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}


// ======================== 初始化入口 ========================

async function init() {
  setRandomBackground();            // 随机背景
  renderEnginePanel();              // 渲染引擎列表
  updateCurrentEngineDisplay();     // 显示当前引擎（Bing）
  await loadLinksData();            // 加载链接数据
  bindEvents();                     // 绑定交互事件

  // 初始清空按钮状态
  const input = document.getElementById('searchInput');
  if (input.value.trim()) {
    document.getElementById('clearBtn').style.display = 'flex';
  }
}

// 启动一切
init();
