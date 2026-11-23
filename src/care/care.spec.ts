import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { MediaStorage } from '../storage/object-storage.js';
import type { UsersService } from '../users/users.service.js';
import { ConsultationNotesService, DermatologistsService } from './care.js';

const user = { id: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77', email: null, displayName: null };
const doctorRow = {
  id: 'd1', name: 'Dr. Maya Shah', speciality: 'Dermatologist', focus: 'Acne', about: 'About', languages: ['English'],
  rating: '4.5', review_count: 10, fee_cents: 2000, currency: 'USD', photo_url: null, video: true, call: false, slot_times: ['10:30 AM'],
};

describe('dermatologists', () => {
  it('shows active doctors with the fee in dollars, filtered by visit type', async () => {
    const database = { query: vi.fn().mockResolvedValue([doctorRow]) };
    const service = new DermatologistsService(database as unknown as DatabaseService);
    expect(await service.list('call')).toEqual([expect.objectContaining({ name: 'Dr. Maya Shah', fee: '20.00', rating: 4.5 })]);
    expect(database.query.mock.calls[0][0]).toContain('where active and call');
  });
});

describe('consultation notes', () => {
  const note = { id: 'n1', dermatologist_id: null, doctor_name: 'Dr. A', visited_on: '2026-10-16', title: null, notes: '', photo_object_key: null, doctor_photo_object_key: null, doctor_photo_url: null };
  function setup(head: { contentType: string; byteSize: number } | null = { contentType: 'image/jpeg', byteSize: 100 }) {
    const database = { query: vi.fn(async (sql: string, _params?: unknown[]) => (sql.startsWith('insert') ? [{ id: 'n1' }] : sql.startsWith('select n.id') ? [note] : [])) };
    const media = { head: vi.fn().mockResolvedValue(head), delete: vi.fn(), createSignedDownload: vi.fn().mockResolvedValue('https://signed') };
    const service = new ConsultationNotesService({ getMe: vi.fn() } as unknown as UsersService, database as unknown as DatabaseService, media as unknown as MediaStorage);
    return { service, database, media };
  }
  it('saves a note for the caller', async () => {
    const { service, database } = setup();
    await service.create(user, { doctor_name: ' Dr. A ', visited_on: '2026-10-16' });
    const insert = database.query.mock.calls.find(call => String(call[0]).startsWith('insert'));
    expect(insert?.[1]?.slice(0, 4)).toEqual([user.id, null, 'Dr. A', '2026-10-16']);
  });
  it('refuses a photo from another account or one not uploaded', async () => {
    await expect(setup().service.create(user, { doctor_name: 'A', visited_on: '2026-10-16', photo_object_key: 'users/00000000-0000-0000-0000-000000000000/consultation-1.jpg' })).rejects.toMatchObject({ status: 400 });
    await expect(setup(null).service.create(user, { doctor_name: 'A', visited_on: '2026-10-16', photo_object_key: `users/${user.id}/consultation-1.jpg` })).rejects.toMatchObject({ status: 409 });
  });
});
