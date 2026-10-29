import type { MeshData } from './meshProcessor';

/**
 * Representa la estructura de datos persistida para una sesión activa de Geo_Arc.
 */
export interface ProjectSession {
  version: number;
  timestamp: number;
  fileName: string;
  meshData?: MeshData | any;
  customLotPts?: { x: number; y: number; elev: number }[] | null;
  analysisMode?: string;
  crs?: string;
  activeTab?: string;
  ogucParams?: any;
  solarParams?: any;
  location?: { lat: number; lon: number };
  viewerMode?: string;
  colorPalette?: string;
  interval?: number;
  zExaggeration?: number;
}

export const DB_NAME = 'geoarc_db';
export const DB_VERSION = 1;
export const STORE_NAME = 'project_session';
export const SESSION_KEY = 'active_project';

/**
 * Inicializa y abre la conexión con la base de datos IndexedDB local.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB no está disponible en este entorno o modo privado estricto.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Error desconocido al abrir IndexedDB'));
    };
  });
}

/**
 * Guarda el estado actual de la sesión del proyecto en IndexedDB.
 * Captura silenciosamente errores de cuota o bloqueos en modo incógnito.
 */
export async function saveSession(session: ProjectSession): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session, SESSION_KEY);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[storageService] Fallo al guardar sesión en IndexedDB (cuota excedida o modo privado):', err);
  }
}

/**
 * Recupera el estado de la sesión guardada previamente desde IndexedDB.
 * Sanitiza la estructura de malla para evitar desbordes o estados corruptos.
 */
export async function loadSession(): Promise<ProjectSession | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);

      req.onsuccess = () => {
        const result = req.result as ProjectSession | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        // Sanitización de integridad: asegurar que si existe meshData tenga grilla válida
        if (result.meshData) {
          if (!Array.isArray(result.meshData.grid) || result.meshData.grid.length === 0) {
            console.warn('[storageService] meshData corrupto o sin grilla de elevación. Descartando terreno cacheado.');
            result.meshData = undefined;
          }
        }

        resolve(result);
      };

      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[storageService] Fallo al cargar sesión desde IndexedDB:', err);
    return null;
  }
}

/**
 * Purga la sesión activa en IndexedDB al restablecer el proyecto.
 */
export async function clearSession(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(SESSION_KEY);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[storageService] Fallo al limpiar sesión en IndexedDB:', err);
  }
}
