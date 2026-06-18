/**
 * Helper to convert a string into an array of bytes (Uint8Array)
 */
function textToBytes(text) {
    return new TextEncoder().encode(text);
}

/**
 * Helper to convert bytes back into a readable string
 */
function bytesToText(bytes) {
    return new TextDecoder().decode(bytes);
}

/**
 * Derives a secure 256-bit AES-GCM key from a weak human passkey using PBKDF2.
 */
async function deriveKey(passkeyStr, saltBytes) {
    const encoder = new TextEncoder();
    const baseKey = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(passkeyStr),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBytes,
            iterations: 120000, // Matches standard security minimums
            hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypts plaintext and packs it with the random Salt and Nonce into a Base64 string.
 *
 * Output encoding (two layers):
 *   1. Binary payload  →  btoa()  →  ASCII string  (Latin-1 safe, each byte one char)
 *   2. ASCII string    →  btoa()  →  Base64 string (pure ASCII, safe for any transport/GitHub)
 *
 * Using two layers ensures the exported string contains only [A-Za-z0-9+/=] characters
 * so it survives UTF-8 pipelines without any byte corruption.
 */
export async function encryptText(plaintext, passkeyStr) {
    if (!passkeyStr) {
        return btoa(plaintext);
    }
    
    const salt = window.crypto.getRandomValues(new Uint8Array(16));  // 16 bytes salt
    const nonce = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes nonce for GCM
    
    const cryptoKey = await deriveKey(passkeyStr, salt);
    
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        cryptoKey,
        textToBytes(plaintext)
    );
    
    const ciphertextBytes = new Uint8Array(ciphertextBuffer);

    // Combine metadata elements into a single uniform byte array
    // Layout: [16 bytes Salt] [12 bytes Nonce] [Variable Ciphertext]
    const combinedPayload = new Uint8Array(salt.length + nonce.length + ciphertextBytes.length);
    combinedPayload.set(salt, 0);
    combinedPayload.set(nonce, salt.length);
    combinedPayload.set(ciphertextBytes, salt.length + nonce.length);

    // Layer 1: binary → ASCII string (each byte becomes one Latin-1 character)
    const asciiStr = String.fromCharCode(...combinedPayload);

    // Layer 2: ASCII string → Base64 (now every character in the output is safe ASCII)
    return btoa(btoa(asciiStr));
}

/**
 * Unpacks a Base64 string payload, reconstructs the key, and decrypts the content.
 *
 * Reverses the two-layer encoding from encryptText:
 *   1. atob() on the outer layer  →  recovers the ASCII string (Latin-1 chars)
 *   2. atob() on the ASCII string →  recovers the original binary string
 *   3. Slice salt / nonce / ciphertext → decrypt
 */
export async function decryptText(base64Payload, passkeyStr) {
    if (!passkeyStr) {
        return atob(base64Payload);
    }

    // Layer 2 unwrap: base64 → ASCII string
    const asciiStr = atob(base64Payload);

    // Layer 1 unwrap: ASCII string → binary string (each char's code is the original byte)
    const binaryStr = atob(asciiStr);

    // Reconstruct raw binary array from the binary string
    const combinedPayload = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        combinedPayload[i] = binaryStr.charCodeAt(i);
    }

    if (combinedPayload.length < 28) throw new Error("Payload is corrupt or altered.");

    // Extract slices according to the packed storage layout
    const salt = combinedPayload.slice(0, 16);
    const nonce = combinedPayload.slice(16, 28);
    const ciphertext = combinedPayload.slice(28);

    const cryptoKey = await deriveKey(passkeyStr, salt);

    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: nonce },
            cryptoKey,
            ciphertext
        );
        return bytesToText(decryptedBuffer);
    } catch (err) {
        throw new Error("Decryption failed. Invalid passkey or altered data.");
    }
}