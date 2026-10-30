import { restaurantInfo } from '../data/content';
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'alas-daun-admin-token';
async function request(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    const body = await response.json();
    if (!response.ok)
        throw new Error(body.error || 'Permintaan gagal');
    return (body.data ?? body);
}
export async function insertReservation(r) {
    try {
        await request('/api/reservations', {
            method: 'POST',
            body: JSON.stringify({
                name: r.name,
                phone: r.phone,
                date: r.date,
                time: r.time,
                guests: r.guests,
                area: r.area || null,
                notes: r.notes || null,
            }),
        });
        return { error: null };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
export async function fetchReservations() {
    try {
        const data = await request('/api/reservations', {
            headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ''}` },
        });
        return { data, error: null };
    }
    catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) };
    }
}
export async function login(email, password) {
    const result = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(TOKEN_KEY, result.token);
}
export function hasSession() {
    return Boolean(localStorage.getItem(TOKEN_KEY));
}
export function logout() {
    localStorage.removeItem(TOKEN_KEY);
}
export function buildWhatsAppMessage(r, lang) {
    if (lang === 'id') {
        return `*Reservasi Alas Daun*\n\nNama: ${r.name}\nNo. WhatsApp: ${r.phone}\nTanggal: ${r.date}\nJam: ${r.time}\nJumlah Orang: ${r.guests}\n${r.area ? `Area: ${r.area}\n` : ''}${r.notes ? `Catatan: ${r.notes}\n` : ''}\nMohon konfirmasi reservasi saya. Terima kasih!`;
    }
    return `*Alas Daun Reservation*\n\nName: ${r.name}\nWhatsApp: ${r.phone}\nDate: ${r.date}\nTime: ${r.time}\nGuests: ${r.guests}\n${r.area ? `Area: ${r.area}\n` : ''}${r.notes ? `Notes: ${r.notes}\n` : ''}\nPlease confirm my reservation. Thank you!`;
}
export function openWhatsApp(message) {
    window.open(`https://wa.me/${restaurantInfo.whatsapp}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}
