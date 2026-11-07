/**
 * Firestore 무료 1GB 용량 영구 유지를 위한 오래된 식단 데이터 자동 정리(Cleanup/TTL) 유틸리티
 * 
 * - 학교 기본 정보나 최근 45일(약 1.5개월)간의 최신 식단 데이터는 안전하게 보존됩니다.
 * - 45일 이전의 지난 식단 문서만 백그라운드에서 자동 삭제하여 Spark(무료) 플랜 용량을 영구히 초과하지 않도록 관리합니다.
 */
import { collection, getDocs, deleteDoc } from 'firebase/firestore';

/**
 * 45일 이전의 지난 식단 데이터를 백그라운드에서 안전하게 자동 정리
 * @param {object} db - Firestore db 인스턴스
 * @param {string} schoolCode - 학교 식별 코드
 * @param {number} daysToKeep - 보관할 일수 (기본 45일)
 * @returns {Promise<number>} 삭제된 오래된 문서 개수
 */
export async function cleanupOldMenus(db, schoolCode, daysToKeep = 45) {
  if (!db || !schoolCode) return 0;

  // 로컬 테스트 모드면 로컬스토리지 정리
  if (localStorage.getItem('useLocalMock') === 'true') {
    return cleanupLocalMockStorage(schoolCode, daysToKeep);
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const pad = n => n.toString().padStart(2, '0');
    const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;

    // schools/{schoolCode}/menus 컬렉션만 확인 (학교 메타 정보는 일체 건드리지 않음)
    const menusColRef = collection(db, 'schools', schoolCode, 'menus');
    const snapshot = await getDocs(menusColRef);

    let deletedCount = 0;
    const deletePromises = [];

    snapshot.forEach((menuDoc) => {
      const docId = menuDoc.id; // YYYY-MM-DD 형식
      // 날짜 형식 문서 중 45일 이전 문서만 선별 삭제
      if (/^\d{4}-\d{2}-\d{2}$/.test(docId) && docId < cutoffStr) {
        deletePromises.push(
          deleteDoc(menuDoc.ref).then(() => {
            deletedCount++;
          })
        );
      }
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      console.log(`[용량 안심 관리] ${schoolCode}: 45일 이전 식단 문서 ${deletedCount}개를 자동 정리하여 무료 용량을 확보했습니다.`);
    }

    return deletedCount;
  } catch (error) {
    // 백그라운드 정리 작업이므로 메인 사용자 경험을 방해하지 않도록 콘솔 로그만 남김
    console.warn("[용량 안심 관리] 오래된 식단 정리 중 알림 (무시 가능):", error);
    return 0;
  }
}

/**
 * 로컬스토리지 모드용 오래된 키 정리
 */
function cleanupLocalMockStorage(schoolCode, daysToKeep) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const pad = n => n.toString().padStart(2, '0');
    const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;

    const prefix = `menus_${schoolCode}_`;
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const datePart = key.slice(prefix.length);
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < cutoffStr) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(k => localStorage.removeItem(k));
    return keysToRemove.length;
  } catch (e) {
    return 0;
  }
}

/**
 * Firebase Console TTL 정책 호환용 만료 일시 반환 (60일 후)
 */
export function getExpiryTimestamp(days = 60) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
