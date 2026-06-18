const BASE_URL = "http://127.0.0.1:8000/api";
const MONOL_SECRET = "grantAccessToThisPersonToReadAndWriteInVault";


export async function ping() {
    const url = `${BASE_URL}/ping`
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to ping: ${response.status} ${response.statusText}`);
    }
    return await response.json();
}


export async function fetchFiles(folder = '') {
  const url = folder != '' 
    ? `${BASE_URL}/files?folder=${encodeURIComponent(folder)}` 
    : `${BASE_URL}/files`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Service-Secret': MONOL_SECRET,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch files: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}


export async function upsertFile(payload) {
  const url = `${BASE_URL}/files`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Service-Secret': MONOL_SECRET,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errBody = await response.json();
      if (errBody && errBody.detail) errorDetail = errBody.detail;
    } catch (_) {}
    
    throw new Error(`Failed to upsert file: ${response.status} - ${errorDetail}`);
  }

  return await response.json();
}


export async function fetchFileContent(filePath) {
  const url = `${BASE_URL}/files/content?path=${encodeURIComponent(filePath)}`;
    
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Service-Secret': MONOL_SECRET,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errBody = await response.json();
      if (errBody && errBody.detail) errorDetail = errBody.detail;
    } catch (_) {}

    throw new Error(`Failed to fetch file content: ${response.status} - ${errorDetail}`);
  }

  return await response.json();
}


export async function deleteFile(filePath, payload) {
  const url = `${BASE_URL}/files?path=${encodeURIComponent(filePath)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'X-Service-Secret': MONOL_SECRET,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errBody = await response.json();
      if (errBody && errBody.detail) errorDetail = errBody.detail;
    } catch (_) {}

    throw new Error(`Failed to delete file: ${response.status} - ${errorDetail}`);
  }

  return await response.json();
}

// deleteFile("monol/config.json", {
//   sha: "ad0c5a55bafabf36eac8f1a69852f783c28b6e67", // Required to verify state
//   message: "Removing deprecated config",
//   notification: "Cleaning up old configurations 🧹"
// })
// .then(console.log)
// .catch(console.error);
// fetchFileContent("monol/config.json")
//   .then(data => {
//     console.log("File SHA:", data.sha);
//     const decodedText = atob(data.content);
//     console.log("File Content:", decodedText);
//   })
//   .catch(console.error);
// upsertFile({
//   path: "monol/config.json",
//   content: btoa(JSON.stringify({ active: true })), // Base64 encoded string
//   message: "Initial config commit",
//   notification: "Config file initialized! 🎉"
// })
// .then(console.log)
// .catch(console.error);
// ping().then(console.log).catch(console.error)
// fetchFiles().then(console.log).catch(console.error)