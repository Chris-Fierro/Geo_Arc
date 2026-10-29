/**
 * Validador puro y sanitizador de esquemas de archivos de proyecto .geoarc.
 * Previene corrupción de estado de la aplicación, ataques DoS y vectores SSRF/XSS.
 * (QUAL-03, D-03)
 */

export interface GeoarcValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida la integridad estructural, congruencia de grilla y protocolos de textura
 * de una carga útil .geoarc deserializada antes de mutar cualquier estado reactivo.
 *
 * @param data Objeto parseado de archivo .geoarc
 * @returns GeoarcValidationResult indicando validez y mensaje de error descriptivo en caso de fallo
 */
export function validateGeoarcPayload(data: unknown): GeoarcValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'El archivo no contiene un objeto JSON válido.' };
  }

  const m = (data as any).meshData;
  if (!m || typeof m !== 'object') {
    return { valid: false, error: 'Estructura meshData ausente en el archivo.' };
  }

  // 1. Validación de dimensiones físicas
  if (!Number.isFinite(m.w) || m.w <= 0 || !Number.isFinite(m.h) || m.h <= 0) {
    return { valid: false, error: 'Dimensiones físicas w o h inválidas o no positivas.' };
  }

  // 2. Validación de resolución de grilla
  if (!Number.isInteger(m.cols) || m.cols <= 0 || !Number.isInteger(m.rows) || m.rows <= 0) {
    return { valid: false, error: 'Resolución de grilla cols o rows no es un entero positivo.' };
  }

  // 3. Validación de cotas de elevación
  if (!Number.isFinite(m.minEv) || !Number.isFinite(m.maxEv) || m.minEv > m.maxEv) {
    return { valid: false, error: 'Cotas de elevación minEv o maxEv inconsistentes o no finitas.' };
  }

  // 4. Integridad de la grilla de elevación
  if (!Array.isArray(m.grid) || m.grid.length !== m.cols * m.rows) {
    return {
      valid: false,
      error: `Longitud de grilla (${m.grid?.length ?? 0}) no coincide con cols * rows (${m.cols * m.rows}).`,
    };
  }

  // 5. Verificación de finitud en cada cota de la grilla
  for (let i = 0; i < m.grid.length; i++) {
    const val = m.grid[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return {
        valid: false,
        error: `Valor no finito detectado en grilla en índice ${i}.`,
      };
    }
  }

  // 6. Sanitización estricta de textura satelital (prevención de SSRF/XSS)
  if (m.satelliteTexture !== undefined && m.satelliteTexture !== null) {
    if (typeof m.satelliteTexture !== 'string') {
      return { valid: false, error: 'satelliteTexture debe ser una cadena.' };
    }
    const isBase64Jpeg = m.satelliteTexture.startsWith('data:image/jpeg;base64,');
    const isBase64Png = m.satelliteTexture.startsWith('data:image/png;base64,');
    const isBlobUrl = m.satelliteTexture.startsWith('blob:');

    if (!isBase64Jpeg && !isBase64Png && !isBlobUrl) {
      return {
        valid: false,
        error:
          'satelliteTexture contiene un protocolo no permitido (sólo data:image/jpeg, data:image/png o blob:).',
      };
    }
  }

  return { valid: true };
}
