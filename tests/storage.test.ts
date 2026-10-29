import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveSession,
  loadSession,
  clearSession,
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  SESSION_KEY,
} from '../src/lib/storageService';

describe('storageService - Contrato de Persistencia Local y Resiliencia en Entorno Node (QUAL-01, D-02)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('expone constantes de base de datos e índices correctos per D-02', () => {
    expect(DB_NAME).toBe('geoarc_db');
    expect(DB_VERSION).toBe(1);
    expect(STORE_NAME).toBe('project_session');
    expect(SESSION_KEY).toBe('active_project');
  });

  it('retorna null con elegancia ante ausencia de IndexedDB nativo en entorno Node.js', async () => {
    // En Node.js (sin polyfills de window/indexedDB), loadSession captura el error y retorna null
    const result = await loadSession();
    expect(result).toBeNull();
  });

  it('saveSession resuelve exitosamente sin arrojar excepciones no controladas en entorno Node.js', async () => {
    const dummySession = {
      version: 1,
      timestamp: Date.now(),
      fileName: 'proyecto-prueba.geoarc',
      analysisMode: 'terrain',
    };

    await expect(saveSession(dummySession)).resolves.toBeUndefined();
  });

  it('clearSession resuelve exitosamente sin arrojar excepciones no controladas en entorno Node.js', async () => {
    await expect(clearSession()).resolves.toBeUndefined();
  });
});
