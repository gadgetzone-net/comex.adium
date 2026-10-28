# ADIUM · Portal Logístico HTML

Aplicación HTML, CSS y JavaScript para consultar y gestionar datos logísticos desde el navegador. No requiere instalar un MSI, un ejecutable propio, Python ni un servidor de aplicación. Mantiene la identidad visual ADIUM.

## Uso

Abrí `index.html` en Edge o Chrome actualizado, o accedé al sitio desde GitHub Pages cuando esté habilitado. Conservá la carpeta completa: el HTML utiliza sus archivos JS, CSS y `vendor/`.

1. Usá **Cargar Excel**, elegí el conjunto y el archivo `.xlsx`.
2. Revisá **Validar archivo** y la vista previa.
3. Confirmá con **Actualizar datos**.
4. Descargá respaldos JSON periódicos. **Importar JSON** también acepta el `datos.json` de la versión anterior.

No se incluyen datos operativos, usuarios ni contraseñas. Los archivos cargados se procesan dentro del navegador; no se envían a GitHub. La aplicación empieza vacía.

## Funciones

- Inventario, ubicaciones, equivalencias, búsqueda, detalle y exportación CSV.
- Carga de inventario (`Datos` / `RESUMEN`), ubicaciones (`TOTAL` / `TOTAL (2)`) y equivalencias (`Fusion de datos`), con validaciones y vista previa.
- Alertas con motivo y mapa de ocupación.
- Alta de ubicaciones y traslados pendientes. Los saldos cambian al confirmar la verificación física; se vuelven a validar origen, destino y stock asignado.
- Persistencia en IndexedDB, historial y copia automática del estado anterior a la última modificación. Los respaldos actual y anterior pueden descargarse como JSON.

## Alcance de los datos

Cada navegador y dirección del sitio tienen su propio almacenamiento. No hay sincronización entre equipos, usuarios compartidos ni conexión a QAD. Los movimientos registrados son locales y no sustituyen las transacciones del sistema corporativo. Las cantidades de operaciones se calculan hasta nueve decimales.

Los datos pueden perderse si se borra el almacenamiento del navegador, se usa modo privado o se cambia de equipo/dirección. Un cambio de carpeta al abrir archivos locales también puede cambiar el almacenamiento; conservá respaldos fuera del navegador.

La interfaz no implementa contraseñas en JavaScript: un HTML estático no proporciona autenticación de servidor. Para usuarios y una base común se necesita un servicio adicional autorizado.

## GitHub

Los archivos de la raíz están preparados para GitHub Pages, incluso bajo `/comex.adium/`. `.nojekyll` evita procesar los recursos con Jekyll. El workflow valida la sintaxis de los scripts; la publicación se configura por separado en **Settings → Pages → Deploy from a branch → main / (root)** si el plan lo permite.

Este repositorio se mantiene privado. GitHub Pages en repositorios privados depende del plan; la privacidad del repositorio por sí sola no garantiza un sitio privado. No se cambió la visibilidad del repositorio. La versión actual no contiene inventario real, pero el historial del repositorio anterior conserva su `datos.json`: no hagas público este repositorio sin revisar ese historial.

## Dependencias y comprobaciones

SheetJS CE 0.20.3 está incluido en `vendor/`, descargado de su distribución oficial; licencia y huella SHA256 junto al archivo. No se carga desde un CDN al usar la aplicación. Se usan fuentes del sistema.

Se verificaron por separado lectura de los tres formatos Excel y reglas de movimientos. La verificación de navegador cubre carga con vista previa, ceros iniciales, equivalencias, pendientes, confirmación, saldos, recarga, CSV, respaldo/restauración JSON y ruta de proyecto. La publicación efectiva en GitHub Pages depende de su configuración y no se deduce de estas pruebas locales.
