import * as pdfjsLib from 'pdfjs-dist';
import { normalizeAssetUrl } from '../supabase/mappers';

// Global worker setup for browser environment
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

// In-memory document and binary caches
const docCache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();
const binaryCache = new Map<string, ArrayBuffer>();

const DB_NAME = 'miitjee_pdf_cache_db';
const STORE_NAME = 'pdf_blobs';

/**
 * Open IndexedDB for persistent binary caching across page reloads.
 */
function openPdfDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Save raw PDF binary into persistent storage and memory cache for a given key.
 */
export async function savePdfBinary(key: string, buffer: ArrayBuffer, name?: string): Promise<void> {
  if (!key || !buffer || buffer.byteLength === 0) return;
  
  // Clone buffer to avoid detachment issues
  const cloned = buffer.slice(0);
  binaryCache.set(key, cloned);

  const db = await openPdfDb();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      key,
      buffer: cloned.slice(0),
      name: name || key,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[pdfDocumentCache] IndexedDB save warning:', err);
  }
}

/**
 * Compute a deterministic canonical PDF ID from raw PDF bytes.
 * Same PDF content -> Always the exact same canonical PDF ID.
 * Different PDF content -> Different canonical PDF ID.
 */
export async function computeCanonicalPdfId(buffer: ArrayBuffer): Promise<string> {
  if (!buffer || buffer.byteLength === 0) return `pdf_${Date.now()}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuf = await crypto.subtle.digest('SHA-256', buffer.slice(0));
      const hashArr = Array.from(new Uint8Array(hashBuf));
      const hex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `pdf_${hex.slice(0, 16)}`;
    } catch {
      // Fallback to deterministic hash
    }
  }

  const bytes = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  const len = bytes.length;
  const step = Math.max(1, Math.floor(len / 4096));
  for (let i = 0; i < len; i += step) {
    h1 ^= bytes[i]!;
    h1 = Math.imul(h1, 0x01000193);
  }
  const hex = (h1 >>> 0).toString(16).padStart(8, '0') + len.toString(16);
  return `pdf_${hex}`;
}

/**
 * Attach PDF binary to multiple aliases (e.g. pdfId, pdfUrl, filename, canonicalId) and invalidate document cache.
 */
export async function attachPdfBinary(keys: (string | null | undefined)[], buffer: ArrayBuffer, name?: string): Promise<string> {
  if (!buffer || buffer.byteLength === 0) return '';
  const canonicalId = await computeCanonicalPdfId(buffer);
  const allKeys = [...keys, canonicalId];
  for (const k of allKeys) {
    if (k && k.trim()) {
      docCache.delete(k);
      await savePdfBinary(k, buffer.slice(0), name);
    }
  }
  return canonicalId;
}

/**
 * Retrieve raw PDF binary from memory or persistent storage.
 */
export async function getPdfBinary(key: string): Promise<ArrayBuffer | null> {
  if (!key) return null;

  if (binaryCache.has(key)) {
    const buf = binaryCache.get(key);
    if (buf && buf.byteLength > 0) {
      return buf.slice(0);
    }
  }

  const db = await openPdfDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.buffer && req.result.buffer.byteLength > 0) {
          const loadedBuf = req.result.buffer.slice(0);
          binaryCache.set(key, loadedBuf);
          resolve(loadedBuf.slice(0));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export interface PdfDocumentSource {
  pdfId?: string | null;
  pdfUrl?: string | null;
  buffer?: ArrayBuffer | null;
  pdfName?: string | null;
  forceFresh?: boolean;
}

/**
 * Fetch PDF array buffer from a remote or normalized URL with retry backoff.
 */
async function fetchPdfBufferWithRetry(url: string, maxAttempts: number = 2): Promise<ArrayBuffer | null> {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxAttempts) {
    attempt++;
    let timeout: any = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 2000);
      if (timeout && typeof timeout.unref === 'function') {
        timeout.unref();
      }

      const res = await fetch(url, { signal: controller.signal });
      if (timeout) clearTimeout(timeout);

      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf && buf.byteLength > 0) {
          return buf;
        }
      }
    } catch (err) {
      if (timeout) clearTimeout(timeout);
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  console.warn(`[pdfDocumentCache] Fetch failed after ${maxAttempts} attempts for ${url}:`, lastError);
  return null;
}

/**
 * Centralized, authoritative PDF Document loader.
 * Loads and caches PDFDocumentProxy instances in browser session memory.
 * ABSOLUTE RULE: Zero silent fallback to dummy/bundled PDFs.
 * If source cannot be resolved, fails closed with a clear error so UI can display RETRY.
 */
export function getPdfDocument(source: PdfDocumentSource): Promise<pdfjsLib.PDFDocumentProxy> {
  const cacheKey = source.pdfId || source.pdfUrl || 'default_pdf';

  if (source.forceFresh) {
    docCache.delete(cacheKey);
    if (source.pdfId) docCache.delete(source.pdfId);
    if (source.pdfUrl) docCache.delete(source.pdfUrl);
  }

  if (docCache.has(cacheKey)) {
    return docCache.get(cacheKey)!;
  }

  const loaderPromise = (async () => {
    // 1. If ArrayBuffer is directly provided and valid
    if (source.buffer && source.buffer.byteLength > 0) {
      const safeBuffer = source.buffer.slice(0);
      if (source.pdfId) void savePdfBinary(source.pdfId, safeBuffer.slice(0));
      if (source.pdfUrl) void savePdfBinary(source.pdfUrl, safeBuffer.slice(0));
      return await pdfjsLib.getDocument({ data: new Uint8Array(safeBuffer) }).promise;
    }

    // 2. Check memory / IndexedDB binary store by pdfId
    if (source.pdfId) {
      const cachedBuf = await getPdfBinary(source.pdfId);
      if (cachedBuf && cachedBuf.byteLength > 0) {
        return await pdfjsLib.getDocument({ data: new Uint8Array(cachedBuf.slice(0)) }).promise;
      }
    }

    // 3. Check memory / IndexedDB binary store by pdfUrl
    if (source.pdfUrl) {
      const cachedBuf = await getPdfBinary(source.pdfUrl);
      if (cachedBuf && cachedBuf.byteLength > 0) {
        return await pdfjsLib.getDocument({ data: new Uint8Array(cachedBuf.slice(0)) }).promise;
      }
    }

    // 4. Try fetching from network / URL with normalization and retries
    const candidateUrls: string[] = [];
    if (source.pdfUrl && typeof source.pdfUrl === 'string' && source.pdfUrl.trim().length > 0) {
      const trimmed = source.pdfUrl.trim();
      candidateUrls.push(trimmed);
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('blob:')) {
        const normalized = normalizeAssetUrl(trimmed);
        if (normalized && normalized !== trimmed) {
          candidateUrls.push(normalized);
        }
      }
    }

    for (const url of candidateUrls) {
      if (url.startsWith('blob:') && typeof window !== 'undefined') {
        // Blob URLs are only valid within the creating browser context
        try {
          const res = await fetch(url);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            if (buf && buf.byteLength > 0) {
              if (source.pdfId) void savePdfBinary(source.pdfId, buf.slice(0));
              return await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
            }
          }
        } catch {
          // Continue to next candidate
        }
      } else if (!url.startsWith('blob:')) {
        const buf = await fetchPdfBufferWithRetry(url, 2);
        if (buf && buf.byteLength > 0) {
          if (source.pdfId) void savePdfBinary(source.pdfId, buf.slice(0));
          void savePdfBinary(url, buf.slice(0));
          return await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
        }
      }
    }

    // Fail closed with authoritative error (never silently fallback)
    throw new Error(
      `PDF_SOURCE_MISSING: Unable to load the original question paper PDF document.`
    );
  })();

  docCache.set(cacheKey, loaderPromise);

  // If loading failed, remove from cache so subsequent retries can succeed
  loaderPromise.catch(() => {
    docCache.delete(cacheKey);
  });

  return loaderPromise;
}

/**
 * Evict a specific PDF document from memory cache to allow clean retry.
 */
export function evictPdfDocument(key: string): void {
  if (!key) return;
  docCache.delete(key);
}

/**
 * Clear document cache (useful for testing or memory resets).
 */
export function clearPdfDocumentCache(): void {
  docCache.clear();
  binaryCache.clear();
}
