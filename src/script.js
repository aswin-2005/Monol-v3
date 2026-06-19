// script.js — UI orchestrator
import { ping, fetchFiles, fetchFileContent, upsertFile, deleteFile } from './api.js';
import { MONOL_WATERMARK } from './config.js';
import { encryptText, decryptText } from './crypto.js';
import { getNewFileName } from './utils.js';

// ── DOM References ─────────────────────────────────────────────────────────────
const passkeyInput     = document.getElementById('passkey');
const filesList        = document.getElementById('files-list');
const fileRefreshBtn   = document.getElementById('refresh-btn');
const fileTextarea     = document.getElementById('file-text');
const createFileBtn    = document.getElementById('create-btn');
const saveFileBtn      = document.getElementById('save-btn');
const rekeyBtn         = document.getElementById('rekey-btn');
const rekeyContainer   = document.getElementById('rekey-container');
const newPasskeyInput  = document.getElementById('new-passkey');
const rekeyConfirmBtn  = document.getElementById('rekey-confirm-btn');
const rekeyCancelBtn   = document.getElementById('rekey-cancel-btn');
const statusMsg        = document.getElementById('status-msg');
const deleteBtn        = document.getElementById('delete-btn');
const clearPasskeyBtn  = document.getElementById('clear-passkey-btn');
const sidebarToggle    = document.getElementById('sidebar-toggle');
const prevFileBtn      = document.getElementById('prev-file-btn');
const nextFileBtn      = document.getElementById('next-file-btn');
const shortcutsInfoBtn = document.getElementById('shortcuts-info-btn');
const shortcutsDialog  = document.getElementById('shortcuts-dialog');
const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');
const openFileNameEl   = document.getElementById('open-file-name');


// ── App State ──────────────────────────────────────────────────────────────────
// passkey is intentionally volatile — never persisted, lives only in this session.
let passkey     = null;   // set on Enter in passkey input
let fileName    = null;   // display name only, no folder prefix; null = new file
let fileSha     = null;   // sha returned by fetchFileContent; null for new files
let isDecrypted = false;  // true only when MONOL_WATERMARK found after decryption
let fileNames   = [];     // display names from last sidebar refresh, in list order

const FOLDER_NAME = 'monol';
const FOLDER_PATH = 'monol/';

const MOBILE_MQ = window.matchMedia('(max-width: 767px)');

let altDown = false;
let altComboUsed = false;
let ctrlDown = false;
let ctrlComboUsed = false;


// ── UI Helpers ─────────────────────────────────────────────────────────────────

function setStatus(msg) {
  statusMsg.textContent = msg;
}

function updateOpenFileLabel() {
  if (fileName) {
    openFileNameEl.textContent = fileName;
  } else if (isDecrypted) {
    openFileNameEl.textContent = 'new file';
  } else {
    openFileNameEl.textContent = '';
  }
}

/**
 * Controls whether the textarea and save button are interactive.
 * Only unlocked when a file is successfully decrypted or a new file is created.
 * Rekey button visibility is managed separately — see showRekeyBtn / hideRekeyBtn.
 */
function setEditorLocked(locked) {
  fileTextarea.disabled = locked;
  saveFileBtn.disabled  = locked;
}

/** Show the Rekey button — only called after a confirmed successful decryption. */
function showRekeyBtn() {
  rekeyBtn.classList.remove('hidden');
}

/** Hide the Rekey button and collapse its form — called on lock, create, and load start. */
function hideRekeyBtn() {
  rekeyBtn.classList.add('hidden');
  rekeyContainer.style.display = 'none';
  newPasskeyInput.value = '';
}

/**
 * Show the Delete button — only when a cloud file (fileSha != null) is
 * decrypted in memory (isDecrypted = true). Always called together with showRekeyBtn.
 */
function showDeleteBtn() {
  deleteBtn.classList.remove('hidden');
}

/** Hide the Delete button — called on lock, create, load start, and after deletion. */
function hideDeleteBtn() {
  deleteBtn.classList.add('hidden');
}

function clearPasskey() {
  passkeyInput.value = '';
  passkey = '';
  if (fileName) {
    loadFile(fileName);
  } else {
    setStatus('Passkey cleared.');
  }
}

function openShortcutsDialog() {
  shortcutsDialog.showModal();
}

function cyclePasskeyEditorFocus() {
  if (document.activeElement === passkeyInput) {
    fileTextarea.focus();
  } else if (document.activeElement === fileTextarea) {
    passkeyInput.focus();
  } else {
    passkeyInput.focus();
  }
}

function closeShortcutsDialog() {
  if (shortcutsDialog.open) {
    shortcutsDialog.close();
  }
}

async function pingServer() {
  const light = document.getElementById('status-light');

  try {
      await ping();
      light.className = 'light blink-green';
  } catch (error) {
      console.error(error);
      light.className = 'light blink-red';
  }
}

pingServer();
setInterval(pingServer, 1000);

// ── File List ──────────────────────────────────────────────────────────────────

function toDisplayName(file) {
  const fullName = typeof file === 'object' && file !== null ? file.name : file;
  return fullName.startsWith(FOLDER_PATH)
    ? fullName.slice(FOLDER_PATH.length)
    : fullName;
}

/** Parse monolentry_{month}-{day}-{year}_{h}-{m}-{s}-{ampm} filenames for sort order. */
function fileTimestamp(name) {
  const m = name.match(
    /^monolentry_(\w+)-(\d+)-(\d+)_(\d+)-(\d+)-(\d+)-(am|pm)$/i
  );
  if (!m) return 0;

  const [, month, day, year, hour, min, sec, ampm] = m;
  let h = parseInt(hour, 10);
  if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
  if (ampm.toLowerCase() === 'am' && h === 12) h = 0;

  const parsed = new Date(`${month} ${day}, ${year} ${h}:${min}:${sec}`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sortFilesByLatest(names) {
  return [...names].sort((a, b) => {
    const diff = fileTimestamp(b) - fileTimestamp(a);
    return diff !== 0 ? diff : b.localeCompare(a);
  });
}

function highlightActiveFile() {
  filesList.querySelectorAll('.file-item').forEach((item) => {
    const isActive = item.dataset.name === fileName;
    item.classList.toggle('file-item--active', isActive);
    if (isActive) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function updateNavButtons() {
  const idx = fileName ? fileNames.indexOf(fileName) : -1;
  prevFileBtn.disabled = idx <= 0;
  nextFileBtn.disabled = idx < 0 || idx >= fileNames.length - 1;
}

function closeSidebarOnMobile() {
  if (MOBILE_MQ.matches) {
    sidebarToggle.checked = false;
  }
}

function renderFilesList(names) {
  filesList.innerHTML = names.map((displayName) => {
    const activeClass = displayName === fileName ? ' file-item--active' : '';
    return `<li class="file-item${activeClass}" data-name="${displayName}">${displayName}</li>`;
  }).join('');
  updateNavButtons();
}

async function refreshFilesList({ autoSelectLatest = false } = {}) {
  fileNames = [];
  filesList.innerHTML = '<li class="text-gray-500">Loading...</li>';
  updateNavButtons();
  try {
    const data  = await fetchFiles(FOLDER_NAME);
    const files = data.files || [];

    if (files.length === 0) {
      filesList.innerHTML = '<li class="text-gray-500">No files found.</li>';
      updateNavButtons();
      return;
    }

    fileNames = sortFilesByLatest(files.map(toDisplayName));
    renderFilesList(fileNames);

    if (autoSelectLatest) {
      await loadFile(fileNames[0]);
    } else if (fileName && fileNames.includes(fileName)) {
      highlightActiveFile();
    }
  } catch (err) {
    console.error('refreshFilesList:', err);
    filesList.innerHTML = '<li class="text-red-500">Failed to load files.</li>';
    updateNavButtons();
  }
}

function navigateFile(delta) {
  if (!fileName || fileNames.length === 0) return;
  const idx = fileNames.indexOf(fileName);
  if (idx < 0) return;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= fileNames.length) return;
  loadFile(fileNames[nextIdx], { closeSidebar: true });
}

// ── Load & Decrypt File ────────────────────────────────────────────────────────

async function loadFile(displayName, { closeSidebar = false } = {}) {
  fileName    = displayName;
  fileSha     = null;
  isDecrypted = false;

  updateOpenFileLabel();
  highlightActiveFile();
  updateNavButtons();
  if (closeSidebar) closeSidebarOnMobile();

  fileTextarea.value = 'Loading...';
  setEditorLocked(true);
  hideRekeyBtn();
  hideDeleteBtn(); 
  setStatus('');

  try {
    const fileData = await fetchFileContent(`${FOLDER_PATH}${displayName}`);
    fileSha = fileData.sha; 

    let rawData = fileData.content;
    console.log('loading a file');
    console.log('rawdata : ',rawData);
    console.log('passkey : ', passkey);
    
    

    let decrypted;
    try {
      decrypted = await decryptText(rawData, passkey);
      console.log('decrypted : ',decrypted);
    } catch (_) {
      fileTextarea.value = fileData.content;
      setEditorLocked(true);
      setStatus('⚠ Decryption failed — wrong passkey or no passkey set.');
      return;
    }

    if (decrypted.startsWith(MONOL_WATERMARK)) {
      fileTextarea.value = decrypted.slice(MONOL_WATERMARK.length);
      isDecrypted = true;
      setEditorLocked(false);
      showRekeyBtn();
      // Delete is only available for cloud files that are decrypted — fileSha proves
      // this came from GitHub, isDecrypted proves we can read its actual content.
      if (fileSha) showDeleteBtn();
      setStatus(passkey ? '✓ File decrypted successfully.' : '✓ Plaintext file loaded safely.');
    } else {
      fileTextarea.value = decrypted;
      setEditorLocked(true);
      setStatus('⚠ Decryption failed — wrong passkey or no passkey set.');
    }
  } catch (err) {
    console.error('loadFile:', err);
    fileTextarea.value = '';
    setStatus('✗ Error loading file from server.');
  }
}

// ── Save File ──────────────────────────────────────────────────────────────────

async function saveFile() {
  if (!isDecrypted) return; // guard — should not be reachable since btn is disabled

  // Assign a generated filename for brand-new files
  if (!fileName) {
    fileName = getNewFileName();
  }

  setStatus('Saving...');
  saveFileBtn.disabled = true;

  console.log('saving a file');
  console.log('name : ', fileName);
  console.log('path : ',`${FOLDER_PATH}${fileName}`);
  console.log('passkey : ', passkey);
  
  
  
  try {
    const plaintext = MONOL_WATERMARK + fileTextarea.value;
    const encrypted = await encryptText(plaintext, passkey);
    console.log('plaintext : ',plaintext);
    console.log('encrypted : ', encrypted);
    
    
    const payload = {
      path:    `${FOLDER_PATH}${fileName}`,
      content: encrypted,
      message: `monol: upsert ${fileName}`,
    };

    console.log('payload : ',payload);
    

    // Include sha only for existing files — omitting it signals a create to the API
    if (fileSha) payload.sha = fileSha;
    console.log('payload sha : ', fileSha);
    

    const result = await upsertFile(payload);
    console.log('result : ',result);
    

    // Update sha so future saves on the same file send the correct sha
    fileSha = result.sha;
    console.log('Updated sha : ', fileSha);
    

    setStatus(`✓ ${result.action === 'created' ? 'Created' : 'Saved'} successfully.`);
    updateOpenFileLabel();
    await refreshFilesList();
  } catch (err) {
    console.error('saveFile:', err);
    setStatus(`✗ Save failed: ${err.message}`);
  } finally {
    // Re-enable only if we're still in a decrypted editing state
    saveFileBtn.disabled = !isDecrypted;
  }
}

// ── Create New File ────────────────────────────────────────────────────────────

function createNewFile() {
  fileName    = null; // filename generated at save time
  fileSha     = null;
  isDecrypted = true; // blank canvas is always in writable state

  highlightActiveFile();
  updateNavButtons();
  closeSidebarOnMobile();

  fileTextarea.value = '';
  setEditorLocked(false);
  hideRekeyBtn();    // no existing file to rekey on a blank canvas
  hideDeleteBtn();   // new file has no SHA — cannot delete until saved
  updateOpenFileLabel();
  setStatus('New file — type content and click Save.');
}

// ── Rekey File ─────────────────────────────────────────────────────────────────

/**
 * Re-encrypts the currently decrypted file with a new passkey, upserts it,
 * then promotes the new passkey to the active session passkey.
 */
async function rekeyFile() {
  const newPasskey = newPasskeyInput.value;
  if (!newPasskey) {
    setStatus('⚠ New passkey cannot be empty.');
    return;
  }
  if (!isDecrypted || !fileName) {
    setStatus('⚠ No decrypted file to rekey.');
    return;
  }

  setStatus('Rekeying...');
  rekeyConfirmBtn.disabled = true;

  try {
    const plaintext = MONOL_WATERMARK + fileTextarea.value;
    const encrypted = await encryptText(plaintext, newPasskey);

    const payload = {
      path:    `${FOLDER_PATH}${fileName}`,
      content: encrypted,
      message: `monol: rekey ${fileName}`,
    };
    if (fileSha) payload.sha = fileSha;

    const result = await upsertFile(payload);

    // Promote new passkey — old key is now invalid for this file
    fileSha  = result.sha;
    passkey  = newPasskey;
    passkeyInput.value = newPasskey; // reflect in input for visibility

    // Collapse rekey form; Rekey button stays visible for future rekeying
    rekeyContainer.style.display = 'none';
    newPasskeyInput.value = '';

    setStatus('✓ Rekeyed successfully. New passkey is now active.');
  } catch (err) {
    console.error('rekeyFile:', err);
    setStatus(`✗ Rekey failed: ${err.message}`);
  } finally {
    rekeyConfirmBtn.disabled = false;
  }
}

// ── Delete File ────────────────────────────────────────────────────────────────

/**
 * Deletes the currently open cloud file.
 * Guard: only reachable when fileSha != null (cloud file) and isDecrypted (in memory).
 * Asks for confirmation before sending the irreversible DELETE request.
 */
async function deleteCurrentFile() {
  // Double-check guards — button should never be visible without these, but be safe.
  if (!isDecrypted || !fileSha || !fileName) {
    setStatus('⚠ Cannot delete: file is not a decrypted cloud file.');
    return;
  }

  const confirmed = window.confirm(
    `Permanently delete "${fileName}" from the cloud?\nThis cannot be undone.`
  );
  if (!confirmed) return;

  setStatus('Deleting...');
  deleteBtn.disabled = true;

  try {
    await deleteFile(`${FOLDER_PATH}${fileName}`, {
      sha:     fileSha,
      message: `monol: delete ${fileName}`,
    });

    // Reset all state — file no longer exists
    fileName    = null;
    fileSha     = null;
    isDecrypted = false;

    fileTextarea.value = '';
    setEditorLocked(true);
    hideRekeyBtn();
    hideDeleteBtn();

    updateOpenFileLabel();
    setStatus('✓ File deleted successfully.');
    await refreshFilesList();
    updateNavButtons();
  } catch (err) {
    console.error('deleteCurrentFile:', err);
    setStatus(`✗ Delete failed: ${err.message}`);
  } finally {
    deleteBtn.disabled = false;
  }
}

// ── Event Listeners ────────────────────────────────────────────────────────────

passkeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    passkey = passkeyInput.value;
    // Always re-decrypt the current file with the new passkey, whatever state it's in.
    // loadFile handles showing the right success/failure message on its own.
    if (fileName) {
      loadFile(fileName);
    } else {
      setStatus('Passkey updated.');
    }
  }
});

fileRefreshBtn.addEventListener('click', (e) => {
  e.preventDefault();
  refreshFilesList();
});

// Delegated click — handles dynamically rendered file items
filesList.addEventListener('click', (e) => {
  e.preventDefault();
  const item = e.target.closest('.file-item');
  if (!item) return;
  const name = item.dataset.name;
  if (name) loadFile(name, { closeSidebar: true });
});

prevFileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  navigateFile(-1);
});

nextFileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  navigateFile(1);
});

createFileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  createNewFile();
});

saveFileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  saveFile();
});

// Toggle rekey form — only reachable when editor is unlocked (isDecrypted = true)
rekeyBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const isVisible = rekeyContainer.style.display === 'flex';
  rekeyContainer.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) newPasskeyInput.focus();
});

rekeyConfirmBtn.addEventListener('click', (e) => {
  e.preventDefault();
  rekeyFile();
});

// Allow confirming rekey with Enter inside the new-passkey input
newPasskeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    rekeyFile();
  }
});

rekeyCancelBtn.addEventListener('click', (e) => {
  e.preventDefault();
  rekeyContainer.style.display = 'none';
  newPasskeyInput.value = '';
});

deleteBtn.addEventListener('click', (e) => {
  e.preventDefault();
  deleteCurrentFile();
});

clearPasskeyBtn.addEventListener('click', (e) => {
  e.preventDefault();
  clearPasskey();
});

shortcutsInfoBtn.addEventListener('click', (e) => {
  e.preventDefault();
  openShortcutsDialog();
});

shortcutsCloseBtn.addEventListener('click', (e) => {
  e.preventDefault();
  closeShortcutsDialog();
});

shortcutsDialog.addEventListener('click', (e) => {
  if (e.target === shortcutsDialog) {
    closeShortcutsDialog();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !shortcutsDialog.open) {
    clearPasskey();
    return;
  }

  if (shortcutsDialog.open) return;

  if (e.code === 'AltLeft' || e.code === 'AltRight') {
    altDown = true;
    return;
  }

  if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
    ctrlDown = true;
    return;
  }

  if (ctrlDown && e.ctrlKey) {
    ctrlComboUsed = true;
  }

  if (!altDown || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
    return;
  }

  altComboUsed = true;

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      navigateFile(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      navigateFile(1);
      break;
    case 'n':
    case 'N':
      e.preventDefault();
      createNewFile();
      break;
    case 's':
    case 'S':
      e.preventDefault();
      saveFile();
      break;
  }
});

document.addEventListener('keyup', (e) => {
  if (shortcutsDialog.open) {
    altDown = false;
    altComboUsed = false;
    ctrlDown = false;
    ctrlComboUsed = false;
    return;
  }

  if (e.code === 'AltLeft' || e.code === 'AltRight') {
    altDown = false;
    altComboUsed = false;
    return;
  }

  if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
    if (ctrlDown && !ctrlComboUsed) {
      cyclePasskeyEditorFocus();
    }
    ctrlDown = false;
    ctrlComboUsed = false;
  }
});

window.addEventListener('blur', () => {
  altDown = false;
  altComboUsed = false;
  ctrlDown = false;
  ctrlComboUsed = false;
});

// ── Init ───────────────────────────────────────────────────────────────────────
setEditorLocked(true);
updateNavButtons();
refreshFilesList({ autoSelectLatest: true });