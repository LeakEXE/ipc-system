import { useState, useEffect } from 'react';
import api from './api';

// Batas minimum Total IPC per tingkat (konfigurasi IPC, kategori 'pengaturan').
// 0 = nonaktif untuk tingkat tersebut (tidak ada total yang ditandai merah).
// Gagal mengambil juga dianggap 0 supaya tampilan tetap jalan tanpa error.
const GRADES = ['X', 'XI', 'XII'];

export function gradePrefix(kelas) {
  if (!kelas) return null;
  const prefix = String(kelas).split(' ')[0].toUpperCase();
  return GRADES.includes(prefix) ? prefix : null;
}

// Resolve threshold dari map per-grade + kelas ("X TKJ 1") atau objek siswa ({ kelas }).
export function minIpcFor(map, kelasOrStudent) {
  const kelas = kelasOrStudent && typeof kelasOrStudent === 'object'
    ? kelasOrStudent.kelas
    : kelasOrStudent;
  const value = Number(map?.[gradePrefix(kelas)] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function fetchMinIpcPerGrade() {
  const fallback = { X: 0, XI: 0, XII: 0 };
  try {
    const res = await api.get('/ipc-config/min-ipc-per-grade');
    const out = { ...fallback };
    for (const grade of GRADES) {
      const value = Number(res.data?.[grade]);
      if (Number.isFinite(value) && value > 0) out[grade] = value;
    }
    return out;
  } catch (e) {
    return fallback;
  }
}

// True jika total IPC kurang dari batas minimum (hanya saat batas aktif > 0).
// Total tanpa nilai (null/undefined) tidak ditandai.
export function isBelowMinIpc(total, minIpc) {
  const min = Number(minIpc);
  if (!Number.isFinite(min) || min <= 0) return false;
  if (total === null || total === undefined || total === '') return false;
  const value = Number(total);
  return Number.isFinite(value) && value < min;
}

// Hook: ambil batas minimum per tingkat sekali saat komponen mount.
export function useMinIpcPerGrade() {
  const [minIpc, setMinIpc] = useState({ X: 0, XI: 0, XII: 0 });
  useEffect(() => {
    let alive = true;
    fetchMinIpcPerGrade().then((value) => {
      if (alive) setMinIpc(value);
    });
    return () => { alive = false; };
  }, []);
  return minIpc;
}
