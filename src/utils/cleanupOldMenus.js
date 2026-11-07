import { collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * [방안 A] 용량 자동 안심 관리 (Cleanup / TTL)
 * Firebase 무료 1GB 영구 유지를 위한 30일 이전 식단 백그라운드 자동 정리
 * 
 * @param {string} schoolCode - 학교 식별 코드
 * @param {number} maxAgeDays - 보관 일수 (기본값: 30일, 약 한 달)
 * @param {boolean} force - 하루 1회 제한 무시 여부
 * @returns {Promise<{ success: boolean, deletedCount: number, cutoffDate: string }>}
 */
export async function cleanupOldMenus(schoolCode, maxAgeDays = 30, force = false) {
  if (!schoolCode) return { success: false, deletedCount: 0, cutoffDate: '' };

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const lastCleanupKey = `last_cleanup_${schoolCode}`;
  const lastCleanupDate = localStorage.getItem(lastCleanupKey);

  // 하루에 1회만 백그라운드 자동 실행하여 불필요한 Firestore 읽기/쓰기 쿼터를 절약
  if (!force && lastCleanupDate === todayStr) {
    return { success: true, deletedCount: 0, cutoffDate: '', skipped: true };
  }

  // 30일 전 날짜 계산 (YYYY-MM-DD)
  const cutoffTime = now.getTime() - (maxAgeDays * 24 * 60 * 60 * 1000);
  const cutoffDateObj = new Date(cutoffTime);
  const pad = (n) => n.toString().padStart(2, '0');
  const cutoffDate = `${cutoffDateObj.getFullYear()}-${pad(cutoffDateObj.getMonth() + 1)}-${pad(cutoffDateObj.getDate())}`;

  let deletedCount = 0;

  try {
    // 1. 브라우저 localStorage 내 30일 이전 캐시 정리
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`menus_${schoolCode}_`)) {
          const datePart = key.replace(`menus_${schoolCode}_`, '');
          // datePart가 YYYY-MM-DD 형식일 때 cutoffDate보다 이전인 경우
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < cutoffDate) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn('[Cleanup] 로컬 스토리지 정리 중 경고:', e);
    }

    // 로컬 모드일 때는 Firestore 쿼리 생략
    if (localStorage.getItem('useLocalMock') === 'true') {
      localStorage.setItem(lastCleanupKey, todayStr);
      return { success: true, deletedCount: 0, cutoffDate };
    }

    // 2. Firestore 내 30일 이전 식단 문서 정리
    const menusColRef = collection(db, 'schools', schoolCode, 'menus');
    const snapshot = await getDocs(menusColRef);

    const expiredDocs = [];
    snapshot.forEach((docSnap) => {
      const docId = docSnap.id; // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(docId) && docId < cutoffDate) {
        expiredDocs.push(docSnap.ref);
      }
    });

    if (expiredDocs.length > 0) {
      // batch를 이용해 한 번에 삭제 (최대 500개)
      const batch = writeBatch(db);
      expiredDocs.slice(0, 450).forEach((ref) => {
        batch.delete(ref);
      });
      await batch.commit();
      deletedCount = Math.min(expiredDocs.length, 450);
      console.log(`[Cleanup] 30일 이전 식단 문서 ${deletedCount}개 정리 완료 (기준일: ${cutoffDate})`);
    }

    localStorage.setItem(lastCleanupKey, todayStr);
    return { success: true, deletedCount, cutoffDate };
  } catch (err) {
    console.error('[Cleanup] 자동 정리 실패:', err);
    return { success: false, deletedCount, cutoffDate, error: err.message };
  }
}
