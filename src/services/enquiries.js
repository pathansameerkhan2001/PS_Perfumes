import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_ENQUIRIES_KEY = 'ps_db_enquiries';

export const INITIAL_ENQUIRIES = [
  {
    id: 'enq-01',
    name: 'Mohammed Rizwan',
    email: 'rizwan.m@outlook.com',
    phone: '+91 97001 23456',
    subject: 'Bespoke Wedding Attar Orders in Kadapa',
    message: 'Hello PS Perfumes team, We would like to inquire about customized 50-pack Royal Amber and Oud miniature gift sets for an upcoming wedding in Kadapa. Please connect with pricing.',
    status: 'unread',
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
];

function getLocalEnquiries() {
  try {
    const raw = localStorage.getItem(LOCAL_ENQUIRIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_ENQUIRIES;
}

function saveLocalEnquiries(enqs) {
  try {
    localStorage.setItem(LOCAL_ENQUIRIES_KEY, JSON.stringify(enqs));
  } catch {}
}

export async function getEnquiries() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('contact_enquiries').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) return data;
    } catch {}
  }
  return getLocalEnquiries();
}

export async function submitEnquiry(enquiry) {
  const newEnq = {
    ...enquiry,
    id: `enq-${Date.now()}`,
    status: 'unread',
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('contact_enquiries').insert([newEnq]).select().single();
      if (!error && data) return { data, error: null };
    } catch {}
  }

  const list = getLocalEnquiries();
  saveLocalEnquiries([newEnq, ...list]);
  return { data: newEnq, error: null };
}

export async function updateEnquiryStatus(id, status) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('contact_enquiries').update({ status }).eq('id', id);
    } catch {}
  }

  const list = getLocalEnquiries();
  saveLocalEnquiries(list.map((e) => (e.id === id ? { ...e, status } : e)));
  return { success: true };
}
