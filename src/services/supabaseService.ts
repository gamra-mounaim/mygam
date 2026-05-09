import { getSupabase } from '../lib/supabase';

export async function getProductByBarcode(barcode: string) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .single();

  if (error) {
    console.error('Error fetching product from Supabase:', error);
    return null;
  }
  return data;
}

export async function saveSaleSupabase(total: number) {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('Supabase sync skipped: client not initialized.');
    return null;
  }

  const { data, error } = await supabase
    .from('sales')
    .insert({
      total,
      date: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving sale to Supabase:', error);
    throw error;
  }
  return data;
}

export async function uploadInvoiceToSupabase(fileBlob: Blob, filename: string) {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('Supabase upload skipped: client not initialized.');
    return null;
  }

  const { data, error } = await supabase.storage
    .from('invoices')
    .upload(filename, fileBlob, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (error) {
    console.error('Error uploading to Supabase Storage:', error);
    throw error;
  }
  return data;
}
