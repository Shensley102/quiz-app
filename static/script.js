// ---- Module discovery & select population ----
const DEFAULT_MODULES = {
  Module_1: 'Module_1.json',
  Module_2: 'Module_2.json',
  Module_3: 'Module_3.json',
  Pharm_Quiz_HESI: 'Pharm_Quiz_HESI.json'
};

// If your JSONs live under /static, change this prefix to '/static/'
const MODULE_PATH_PREFIX = '/'; // or '/static/'

let moduleMap = {}; // name -> file

async function discoverModules() {
  try {
    const res = await fetch('/modules.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('modules.json not found');

    const data = await res.json();

    // Accept either { name: file, ... } OR [{name, file}, ...]
    if (Array.isArray(data)) {
      const map = {};
      data.forEach(item => {
        if (item?.name && item?.file) map[item.name] = item.file;
      });
      if (Object.keys(map).length) return map;
      throw new Error('modules.json (array) empty/invalid');
    }

    if (data && typeof data === 'object' && Object.keys(data).length) {
      return data;
    }

    throw new Error('modules.json empty/invalid');
  } catch (err) {
    console.warn('[modules] Falling back to DEFAULT_MODULES →', err.message);
    return DEFAULT_MODULES;
  }
}

function populateModuleSelect() {
  const sel = document.getElementById('moduleSelect');
  if (!sel) return;
  sel.innerHTML = '';

  const names = Object.keys(moduleMap);
  if (!names.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No tests found';
    opt.disabled = true;
    opt.selected = true;
    sel.appendChild(opt);
    return;
  }

  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name.replace(/_/g, ' ');
    sel.appendChild(opt);
  });
}

function getSelectedModuleFile() {
  const sel = document.getElementById('moduleSelect');
  const name = sel?.value;
  const file = moduleMap[name];
  if (!file) throw new Error(`Unknown module: ${name}`);
  return MODULE_PATH_PREFIX + file;
}

// Call this once on load
async function initModulePicker() {
  moduleMap = await discoverModules();
  populateModuleSelect();
}

// ---- Make sure this runs after DOM is ready ----
document.addEventListener('DOMContentLoaded', () => {
  initModulePicker().catch(console.error);
  // ...your existing init code...
});

// Wherever you previously fetched the questions, switch to:
async function fetchQuestionsForSelectedModule() {
  const filePath = getSelectedModuleFile();
  const res = await fetch(filePath, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${filePath}`);
  return await res.json();
}
