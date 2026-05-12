import { supabase } from './supabaseClient';

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Uploads a base64 data URL or Blob to Supabase Storage.
 * Returns the public URL and storage path.
 */
export async function uploadPhoto(
  dataUrl: string,
  visitorId: string,
): Promise<UploadResult> {
  if (!supabase) {
    throw new Error('Supabase not configured. Set NEXT_PUBLIC_SUPABASE_* env vars.');
  }
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'visitor-photos';

  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.split('/')[1] || 'jpg';
  const path = `${new Date().getFullYear()}/${visitorId}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
