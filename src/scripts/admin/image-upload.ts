import { supabase } from '../../lib/supabase';

export interface CasaImageRow {
  id: string;
  casa_id: string;
  storage_path: string;
  url: string;
  alt_es: string;
  alt_en: string;
  sort_order: number;
}

const BUCKET = 'casa-photos';
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.82;

/** Verkleinert ein Bild client-seitig, bevor es hochgeladen wird. */
function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = objectUrl;
  });
}

export async function uploadCasaImage(casaId: string, file: File, sortOrder: number): Promise<CasaImageRow> {
  const blob = await resizeImage(file);
  const path = `${casaId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await supabase
    .from('casa_images')
    .insert({
      casa_id: casaId,
      storage_path: path,
      url: publicUrlData.publicUrl,
      alt_es: '',
      alt_en: '',
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) throw error;
  return data as CasaImageRow;
}

export async function deleteCasaImage(image: CasaImageRow): Promise<void> {
  await supabase.storage.from(BUCKET).remove([image.storage_path]);
  const { error } = await supabase.from('casa_images').delete().eq('id', image.id);
  if (error) throw error;
}

export async function updateCasaImage(
  id: string,
  patch: Partial<Pick<CasaImageRow, 'alt_es' | 'alt_en' | 'sort_order'>>,
): Promise<void> {
  const { error } = await supabase.from('casa_images').update(patch).eq('id', id);
  if (error) throw error;
}

export async function fetchCasaImages(casaId: string): Promise<CasaImageRow[]> {
  const { data, error } = await supabase
    .from('casa_images')
    .select('*')
    .eq('casa_id', casaId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data as CasaImageRow[];
}
