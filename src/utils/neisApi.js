/**
 * NEIS(교육부 교육정보 개방포털) 공공 급식 및 학교정보 API 유틸리티
 * 
 * open.neis.go.kr 공공 API는 CORS 헤더(Access-Control-Allow-Origin: *)를 기본 지원하여
 * 클라이언트 브라우저에서 직접 조회가 가능합니다.
 */

// 시도 지역명 <-> NEIS 시도교육청코드 매핑
export const REGION_TO_ATPT = {
  "서울": "B10",
  "부산": "C10",
  "대구": "D10",
  "인천": "E10",
  "광주": "F10",
  "대전": "G10",
  "울산": "H10",
  "세종": "I10",
  "경기": "J10",
  "강원": "K10",
  "충북": "M10",
  "충남": "N10",
  "전북": "P10",
  "전남": "Q10",
  "경북": "R10",
  "경남": "S10",
  "제주": "T10",
};

export const ATPT_TO_REGION = Object.entries(REGION_TO_ATPT).reduce((acc, [region, code]) => {
  acc[code] = region;
  return acc;
}, {});

/**
 * 나이스 오픈 API 인증키 획득
 * 1) localStorage에 사용자가 설정한 키
 * 2) 로컬 환경변수(VITE_NEIS_API_KEY)
 * 3) 미설정 시 빈 문자열 (일일 1,000건 기본 무료 호출)
 */
export function getNeisApiKey() {
  try {
    return localStorage.getItem('neisApiKey') || import.meta.env.VITE_NEIS_API_KEY || '';
  } catch (e) {
    return import.meta.env.VITE_NEIS_API_KEY || '';
  }
}

export function setNeisApiKey(key) {
  try {
    if (key && key.trim()) {
      localStorage.setItem('neisApiKey', key.trim());
    } else {
      localStorage.removeItem('neisApiKey');
    }
  } catch (e) {}
}

/**
 * 나이스 학교 검색
 * @param {string} schoolName - 검색할 학교명 (예: 은혜학교)
 * @param {string} region - (선택) 시도 지역명 (예: 경남)
 * @returns {Promise<Array>} 학교 정보 목록
 */
export async function searchNeisSchool(schoolName, region = '') {
  if (!schoolName || !schoolName.trim()) return [];

  const apiKey = getNeisApiKey();
  const trimmed = schoolName.trim();
  const keyParam = apiKey ? `&KEY=${encodeURIComponent(apiKey)}` : '';
  let url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=50${keyParam}&SCHUL_NM=${encodeURIComponent(trimmed)}`;
  
  if (region && REGION_TO_ATPT[region]) {
    url += `&ATPT_OFCDC_SC_CODE=${REGION_TO_ATPT[region]}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.schoolInfo || !data.schoolInfo[1] || !data.schoolInfo[1].row) {
      return [];
    }

    return data.schoolInfo[1].row.map(row => ({
      schoolCode: row.SD_SCHUL_CODE,
      schoolName: row.SCHUL_NM,
      atptCode: row.ATPT_OFCDC_SC_CODE,
      atptName: row.ATPT_OFCDC_SC_NM,
      region: ATPT_TO_REGION[row.ATPT_OFCDC_SC_CODE] || row.LCTN_SC_NM || '',
      kind: row.SCHUL_KND_SC_NM || '학교',
      address: row.ORG_RDNMA || row.ORG_FAXNO || '',
    }));
  } catch (error) {
    console.error("NEIS 학교 검색 실패:", error);
    throw error;
  }
}

/**
 * 나이스 급식 메뉴 텍스트 정제
 * 알레르기 유발 정보 번호(예: 1.2.5.6.), 괄호 안내, 특수기호 제거
 */
export function cleanDishName(rawName) {
  if (!rawName) return '';
  return rawName
    .replace(/\([0-9.\s]+\)/g, '')   // (1.2.5.6.) 등의 알레르기 괄호 제거
    .replace(/[0-9.]/g, '')          // 남은 번호와 마침표 제거
    .replace(/[*#@]/g, '')           // 특수기호 제거
    .replace(/\s+/g, ' ')            // 중복 공백 제거
    .trim();
}

/**
 * 나이스 급식 식단 정보 조회
 * @param {string} atptCode - 시도교육청코드 (예: S10)
 * @param {string} schoolCode - 7자리 표준학교코드 (예: 9010168)
 * @param {string} dateStr - YYYY-MM-DD 형식의 날짜
 * @returns {Promise<{ success: boolean, menus?: object, rawList?: string[], calorie?: string, message?: string }>}
 */
export async function fetchNeisMeal(atptCode, schoolCode, dateStr) {
  if (!atptCode || !schoolCode || !dateStr) {
    return { success: false, message: '교육청 코드와 학교 코드가 필요합니다.' };
  }

  const ymd = dateStr.replace(/[^0-9]/g, '');
  const apiKey = getNeisApiKey();
  const keyParam = apiKey ? `&KEY=${encodeURIComponent(apiKey)}` : '';
  const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=10${keyParam}&ATPT_OFCDC_SC_CODE=${atptCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${ymd}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.RESULT && data.RESULT.CODE === 'INFO-200') {
      return { 
        success: false, 
        message: '해당 일자의 나이스 급식 정보가 등록되어 있지 않습니다. (주말, 휴업일 또는 미등록)' 
      };
    }

    const rows = data.mealServiceDietInfo?.[1]?.row;
    if (!rows || rows.length === 0) {
      return { success: false, message: '급식 식단 정보를 찾을 수 없습니다.' };
    }

    // 중식(2) 우선, 없으면 첫 번째 식단 선택
    const meal = rows.find(r => r.MMEAL_SC_CODE === '2') || rows[0];
    const rawDishes = (meal.DDISH_NM || '').split(/<br\s*\/?>|\n/gi);

    const cleanedDishes = rawDishes
      .map(d => cleanDishName(d))
      .filter(d => d.length > 0);

    if (cleanedDishes.length === 0) {
      return { success: false, message: '급식 메뉴 항목이 비어있습니다.' };
    }

    // 밥, 국, 반찬 1~4 매핑
    const parsedMenus = {
      rice: cleanedDishes[0] || '',
      soup: cleanedDishes[1] || '',
      side1: cleanedDishes[2] || '',
      side2: cleanedDishes[3] || '',
      side3: cleanedDishes[4] || '',
      side4: cleanedDishes.length > 6 
        ? cleanedDishes.slice(5).join(', ') 
        : (cleanedDishes[5] || ''),
    };

    return {
      success: true,
      calorie: meal.CAL_INFO || '',
      mealType: meal.MMEAL_SC_NM || '중식',
      rawList: cleanedDishes,
      parsedMenus,
    };
  } catch (error) {
    console.error("NEIS 급식 식단 조회 실패:", error);
    return { success: false, message: `나이스 급식 조회 오류: ${error.message}` };
  }
}
