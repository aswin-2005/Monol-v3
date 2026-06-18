
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

apiSecretInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
        localStorage.setItem('api-secret', apiSecretInput.value);
    }
});

backendUrlInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
        localStorage.setItem('backend-url', backendUrlInput.value);
    }
});

pageWatermarkInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
        localStorage.setItem('page-watermark', pageWatermarkInput.value);
    }
});

filenamePrefixInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
        localStorage.setItem('filename-prefix', filenamePrefixInput.value);
    }
});
