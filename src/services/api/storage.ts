import { uploadFileToStorage } from '../supabase/client';

export async function uploadExamAsset(params: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  folder: 'pdfs' | 'images';
}) {
  return uploadFileToStorage({
    bucket: 'exam-assets',
    folder: params.folder,
    uri: params.uri,
    name: params.name ?? undefined,
    mimeType: params.mimeType ?? undefined,
  });
}
