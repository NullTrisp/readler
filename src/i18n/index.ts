import i18n from 'i18next';
import { getLocales } from 'expo-localization';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'Readler', library: 'Library', downloads: 'Downloads', settings: 'Settings',
      search: 'Search your library', all: 'All', unread: 'Unread', reading: 'Reading', finished: 'Finished',
      folders: 'Folders', positionSlider: 'Reading position',
      emptyLibrary: 'Your library is empty', emptyLibraryHint: 'Connect Google Drive or add local files to start reading.',
      add: 'Add', importFiles: 'Import files', linkFolder: 'Link local folder', googleDrive: 'Google Drive',
      connectDrive: 'Connect Google Drive', chooseFolder: 'Choose this folder', openFolder: 'Open folder',
      back: 'Back', refresh: 'Refresh', cancel: 'Cancel', retry: 'Retry', download: 'Download', remove: 'Remove', pause: 'Pause', resume: 'Resume',
      downloading: 'Downloading', readyOffline: 'Available offline', noDownloads: 'No offline downloads yet.',
      appearance: 'Appearance', system: 'System', language: 'Language', sources: 'Sources', syncNow: 'Sync now',
      signOut: 'Sign out', changeAccount: 'Change account', revoke: 'Revoke Google access', deleteSync: 'Delete synchronized data',
      googleNotConfigured: 'Google OAuth is not configured. Add the EXPO_PUBLIC_GOOGLE_* client IDs.',
      readerUnavailable: 'This file must be available locally before it can be opened.',
      linkedFolderUnavailable: 'The linked folder is no longer available. Link it again.',
      linkedFolderPermission: 'Readler needs permission to read the linked folder.',
      browserStorageInsufficient: 'There is not enough browser storage to import these files. Link the folder with Chrome or Edge instead.',
      bookmark: 'Bookmark', unbookmark: 'Remove bookmark', previous: 'Previous', next: 'Next',
      rtl: 'Right to left', ltr: 'Left to right', error: 'Something went wrong', loading: 'Loading…',
      sourceDrive: 'Drive', sourceLocal: 'Local', progress: '{{value}}% read', noSources: 'No sources connected.',
      onboardingTitle: 'Your books, your way', onboardingBody: 'Read CBZ, EPUB and PDF from Drive or your device. Your place and bookmarks stay with you.',
      startLocal: 'Start with local files', startDrive: 'Start with Google Drive', skip: 'Explore empty library',
    },
  },
  es: {
    translation: {
      appName: 'Readler', library: 'Biblioteca', downloads: 'Descargas', settings: 'Ajustes',
      search: 'Buscar en tu biblioteca', all: 'Todo', unread: 'Sin leer', reading: 'Leyendo', finished: 'Terminado',
      folders: 'Carpetas', positionSlider: 'Posición de lectura',
      emptyLibrary: 'Tu biblioteca está vacía', emptyLibraryHint: 'Conecta Google Drive o añade archivos locales para empezar.',
      add: 'Añadir', importFiles: 'Importar archivos', linkFolder: 'Enlazar carpeta local', googleDrive: 'Google Drive',
      connectDrive: 'Conectar Google Drive', chooseFolder: 'Elegir esta carpeta', openFolder: 'Abrir carpeta',
      back: 'Atrás', refresh: 'Actualizar', cancel: 'Cancelar', retry: 'Reintentar', download: 'Descargar', remove: 'Eliminar', pause: 'Pausar', resume: 'Reanudar',
      downloading: 'Descargando', readyOffline: 'Disponible sin conexión', noDownloads: 'Todavía no hay descargas.',
      appearance: 'Apariencia', system: 'Sistema', language: 'Idioma', sources: 'Fuentes', syncNow: 'Sincronizar ahora',
      signOut: 'Cerrar sesión', changeAccount: 'Cambiar cuenta', revoke: 'Revocar acceso de Google', deleteSync: 'Borrar datos sincronizados',
      googleNotConfigured: 'OAuth de Google no está configurado. Añade los client IDs EXPO_PUBLIC_GOOGLE_*.',
      readerUnavailable: 'El archivo debe estar disponible localmente antes de abrirlo.',
      linkedFolderUnavailable: 'La carpeta enlazada ya no está disponible. Vuelve a enlazarla.',
      linkedFolderPermission: 'Readler necesita permiso para leer la carpeta enlazada.',
      browserStorageInsufficient: 'No hay suficiente espacio en el navegador para importar estos archivos. Enlaza la carpeta con Chrome o Edge.',
      bookmark: 'Marcador', unbookmark: 'Quitar marcador', previous: 'Anterior', next: 'Siguiente',
      rtl: 'Derecha a izquierda', ltr: 'Izquierda a derecha', error: 'Algo salió mal', loading: 'Cargando…',
      sourceDrive: 'Drive', sourceLocal: 'Local', progress: '{{value}}% leído', noSources: 'No hay fuentes conectadas.',
      onboardingTitle: 'Tus libros, a tu manera', onboardingBody: 'Lee CBZ, EPUB y PDF desde Drive o tu dispositivo. Tu posición y marcadores viajan contigo.',
      startLocal: 'Empezar con archivos locales', startDrive: 'Empezar con Google Drive', skip: 'Explorar biblioteca vacía',
    },
  },
};

const language = getLocales()[0]?.languageCode === 'es' ? 'es' : 'en';

// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({ resources, lng: language, fallbackLng: 'en', interpolation: { escapeValue: false } });

export default i18n;
