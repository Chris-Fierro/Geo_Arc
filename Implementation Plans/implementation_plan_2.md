# Módulo 1: Parámetros Normativos OGUC

## Propuesta de Implementación

Para actualizar el panel lateral e incorporar los requerimientos normativos (D.S. N°2, D.O. 16-03-2026), modificaré principalmente el archivo `App.tsx` para agregar los nuevos estados y controles UI correspondientes.

### 1. Nuevas Variables de Estado (`App.tsx`)
Agregaré los siguientes estados:
- `ogucRegionGroup`: `1 | 2 | 3` (Grupo de región para determinar los ángulos de rasante).
- `ogucRasanteStartHeight`: `number` (Default: 2.5m).
- `ogucApplyExtraSetback`: `boolean` (Toggle para Art. 2.6.12 sobre 10.5m).
- `ogucContinuousBaseHeight`: `number` (Default: 0m).

### 2. Lógica de Preselección Automática
Para el Grupo de Región, implementaré un `useEffect` que escuche los cambios en `locationLat` y asigne automáticamente el grupo basado en la latitud aproximada:
- **Grupo 1**: Latitud mayor a -26.0° (Norte).
- **Grupo 2**: Latitud entre -26.0° y -35.0° (Centro).
- **Grupo 3**: Latitud menor a -35.0° (Sur).

### 3. Actualización de la Interfaz del Panel (Sidebar en `App.tsx`)
Reemplazaré la sección OGUC en el panel izquierdo dividiéndola en los tres bloques solicitados:
- **Bloque A — Rasantes**: Selector de grupo (mostrando los ángulos correspondientes) y campo numérico para "Altura arranque rasante" con su respectivo tooltip.
- **Bloque B — Distanciamientos**: Campo para el distanciamiento base y un switch/toggle para el "Distanciamiento adicional sobre 10.5m".
- **Bloque C — Volumen**: Campos para "Altura máxima" y "Altura continua base".

### 4. Actualización del Objeto `ogucParams`
Modificaré el objeto `ogucParams` que se le pasa al `ContourViewer.tsx` para que incluya todas estas nuevas propiedades, de manera que el visor 3D (en el futuro Módulo 2) pueda consumirlas para calcular las geometrías exactas.

## Open Questions

> [!IMPORTANT]
> **Latitudes de Corte para Regiones**
> Dado que la selección automática depende de la Latitud/Longitud, propongo cortes en -26.0° (Límite Antofagasta/Atacama) y -35.0° (Límite O'Higgins/Maule). Si el usuario ingresa coordenadas de Santiago (-33.4°), caerá correctamente en el Grupo 2. ¿Estás de acuerdo con estas latitudes de corte duro para la preselección?

> [!NOTE]
> **Tooltips**
> Mencionaste agregar tooltips a algunos campos. React (sin librerías extra) suele usar el atributo nativo `title` para tooltips simples, o puedo implementar un pequeño componente custom al pasar el mouse por encima del `(?)`. Usaré el atributo nativo `title` para mantener la simplicidad y el estilo limpio a menos que prefieras un componente visual custom.
