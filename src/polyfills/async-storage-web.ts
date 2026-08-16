// Web polyfill for @react-native-async-storage/async-storage
// Maps to window.localStorage on web

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage full or other error
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },

  clear: async (): Promise<void> => {
    try {
      window.localStorage.clear();
    } catch {
      // Ignore
    }
  },

  getAllKeys: async (): Promise<string[]> => {
    try {
      return Object.keys(window.localStorage);
    } catch {
      return [];
    }
  },

  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    try {
      return keys.map(key => [key, window.localStorage.getItem(key)]);
    } catch {
      return keys.map(key => [key, null]);
    }
  },

  multiSet: async (keyValuePairs: [string, string][]): Promise<void> => {
    try {
      keyValuePairs.forEach(([key, value]) => {
        window.localStorage.setItem(key, value);
      });
    } catch {
      // Ignore
    }
  },

  multiRemove: async (keys: string[]): Promise<void> => {
    try {
      keys.forEach(key => window.localStorage.removeItem(key));
    } catch {
      // Ignore
    }
  },
};

export default AsyncStorage;
