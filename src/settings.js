
const apiSecretInput   = document.getElementById('api-secret');
const backendUrlInput  = document.getElementById('backend-url');
const pageWatermarkInput  = document.getElementById('page-watermark');
const filenamePrefixInput  = document.getElementById('filename-prefix');

addEventListener('load', () => {
    apiSecretInput.value = localStorage.getItem('api-secret') || '';
    backendUrlInput.value = localStorage.getItem('backend-url') || '';
    pageWatermarkInput.value = localStorage.getItem('page-watermark') || '';
    filenamePrefixInput.value = localStorage.getItem('filename-prefix') || '';
});

document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('api-secret', apiSecretInput.value);
    localStorage.setItem('backend-url', backendUrlInput.value);
    localStorage.setItem('page-watermark', pageWatermarkInput.value);
    localStorage.setItem('filename-prefix', filenamePrefixInput.value);
});
