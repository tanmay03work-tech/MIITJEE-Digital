export const types = {
  allFiles: '*/*',
  images: 'image/*',
  pdf: 'application/pdf',
};

export function isCancel(err: unknown): boolean {
  return false;
}

export async function pick(options: { type?: string[]; allowMultiple?: boolean; allowMultiSelection?: boolean } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.allowMultiple || options.allowMultiSelection) {
      input.multiple = true;
    }
    if (options.type && options.type.length > 0) {
      input.accept = options.type.join(',');
    }

    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const fileList = Array.from(target.files).map((file) => ({
          uri: URL.createObjectURL(file),
          name: file.name,
          type: file.type,
          size: file.size,
          file: file,
        }));
        resolve(fileList);
      } else {
        reject(new Error('User cancelled document picker'));
      }
    };

    input.click();
  });
}

export async function pickSingle(options: { type?: string[] } = {}) {
  const files = (await pick(options)) as unknown[];
  return files[0];
}

export async function pickMultiple(options: { type?: string[] } = {}) {
  return (await pick({ ...options, allowMultiple: true })) as unknown[];
}

export default {
  pick,
  pickSingle,
  pickMultiple,
  isCancel,
  types,
};
