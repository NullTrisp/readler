const DATABASE_NAME = 'readler-browser-files';
const STORE_NAME = 'files';
let databasePromise: Promise<IDBDatabase> | null = null;

function database() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Browser storage could not be opened.'));
    });
  }
  return databasePromise;
}

export async function putBrowserFile(key: string, value: Blob) {
  const db = await database();
  await requestResult(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key));
}

export async function getBrowserFile(key: string) {
  const db = await database();
  return requestResult<Blob | undefined>(db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key));
}

export async function deleteBrowserFile(key: string) {
  const db = await database();
  await requestResult(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key));
}

function requestResult<T = IDBValidKey>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser storage request failed.'));
  });
}
