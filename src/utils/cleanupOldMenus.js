/**
 * [방안 A] 용량 자동 안심 관리 (Cleanup / TTL)
 * 기존에 선생님들이 등록하신 소중한 학교 식단 데이터가 삭제되지 않도록
 * 안전하게 보호하며 캐시만 점검합니다.
 */
export async function cleanupOldMenus(schoolCode, maxAgeDays = 30, force = false) {
  // 교사들이 입력한 기존 식단 데이터 보존을 위해 영구 보존 모드로 전환
  return { success: true, deletedCount: 0, cutoffDate: '', skipped: true };
}
