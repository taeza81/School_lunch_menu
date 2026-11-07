/**
 * 교육부 NEIS(나이스) 공공 급식 Open API 연동 모듈
 */

const NEIS_API_BASE = 'https://open.neis.go.kr/hub';

/**
 * 환경변수 또는 발급받은 NEIS API 키 반환
 */
export function getNeisApiKey() {
  return import.meta.env.VITE_NEIS_API_KEY || 'd765dc21b0d94369aab17c18d89e51fe';
}

/**
 * 전국 학교 검색 API
 * @param {string} keyword - 학교 이름 (예: "은혜학교", "김해은혜")
 * @param {string} region - 지역 필터 (선택 사항, 예: "경남", "경상남도")
 * @returns {Promise<Array<{ officeCode: string, officeName: string, schoolCode: string, schoolName: string, region: string, address: string, schoolKind: string }>>}
 */
export async function searchNeisSchools(keyword, region = '') {
  const cleanKeyword = (keyword || '').trim();
  if (!cleanKeyword) return [];

  const apiKey = getNeisApiKey();
  const url = new URL(`${NEIS_API_BASE}/schoolInfo`);
  url.searchParams.set('KEY', apiKey);
  url.searchParams.set('Type', 'json');
  url.searchParams.set('pIndex', '1');
  url.searchParams.set('pSize', '40');
  url.searchParams.set('SCHUL_NM', cleanKeyword);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`NEIS API 요청 실패 (상태 코드: ${res.status})`);
    }
    const data = await res.json();

    if (!data.schoolInfo || !data.schoolInfo[1] || !data.schoolInfo[1].row) {
      return [];
    }

    const rows = data.schoolInfo[1].row;
    let schools = rows.map((item) => ({
      officeCode: item.ATPT_OFCDC_SC_CODE, // 관할 교육청 코드 (예: S10)
      officeName: item.ATPT_OFCDC_SC_NM,   // 교육청 명칭 (예: 경상남도교육청)
      schoolCode: item.SD_SCHUL_CODE,      // 행정 표준 학교 코드 (예: 9010001)
      schoolName: item.SCHUL_NM,           // 학교명
      region: item.LCTN_SC_NM,             // 지역 (예: 경상남도)
      address: item.ORG_RDNMA || item.ORG_RDNZC || '', // 도로명 주소
      schoolKind: item.SCHUL_KND_SC_NM || '학교'       // 특수학교/초등학교 등
    }));

    if (region) {
      const cleanRegion = region.replace(/(특별시|광역시|특별자치시|특별자치도|도)/g, '').trim();
      schools = schools.filter(s => s.region.includes(cleanRegion) || s.officeName.includes(cleanRegion));
    }

    return schools;
  } catch (err) {
    console.error('NEIS 학교 검색 에러:', err);
    throw err;
  }
}

/**
 * NEIS 급식 식단 문자열 정리 및 알레르기 번호 제거
 * 예: "친환경현미밥<br/>쇠고기미역국 (5.6.16)<br/>돈육간장불고기 (5.6.10)"
 *  -> ['친환경현미밥', '쇠고기미역국', '돈육간장불고기']
 * @param {string} dishString 
 * @returns {Array<string>}
 */
export function parseDdishNames(dishString) {
  if (!dishString) return [];

  return dishString
    .replace(/<br\s*[\/]?>/gi, '\n') // <br> 태그를 줄바꿈으로 변환
    .split('\n')
    .map((line) => {
      return line
        .replace(/\([0-9\.\s]+\)/g, '') // 알레르기 유발물질 번호 (예: (1.2.5.6.13)) 제거
        .replace(/[*#@]/g, '')           // 특수 기호 제거
        .trim();
    })
    .filter((name) => name.length > 0);
}

/**
 * 파싱된 반찬 목록을 6구 식판 모델(rice, soup, side1~4)에 자동 배치
 * @param {Array<string>} dishList 
 * @returns {{ rice: object, soup: object, side1: object, side2: object, side3: object, side4: object, rawList: Array<string> }}
 */
export function mapDishesToTraySlots(dishList) {
  const result = {
    rice: { name: '', imageUrl: '', type: 'rice' },
    soup: { name: '', imageUrl: '', type: 'soup' },
    side1: { name: '', imageUrl: '', type: 'side1' },
    side2: { name: '', imageUrl: '', type: 'side2' },
    side3: { name: '', imageUrl: '', type: 'side3' },
    side4: { name: '', imageUrl: '', type: 'side4' },
    rawList: [...dishList]
  };

  if (!dishList || dishList.length === 0) return result;

  const remaining = [...dishList];

  // 1. 밥 탐색 (밥, 죽, 라이스, 덮밥, 비빔밥 등)
  const riceKeywords = ['밥', '죽', '라이스', '덮밥', '비빔밥', '볶음밥', '필라프', '카레라이스', '짜장밥'];
  let riceIdx = remaining.findIndex((dish) => riceKeywords.some((kw) => dish.includes(kw)));
  if (riceIdx === -1) {
    // 밥 키워드가 없으면 첫 번째 요소를 기본 밥으로 지정
    riceIdx = 0;
  }
  if (riceIdx !== -1) {
    result.rice.name = remaining[riceIdx];
    remaining.splice(riceIdx, 1);
  }

  // 2. 국 탐색 (국, 찌개, 탕, 찌게, 스프, 수프, 라면, 우동 등)
  const soupKeywords = ['국', '찌개', '탕', '찌게', '스프', '수프', '전골', '조림국'];
  let soupIdx = remaining.findIndex((dish) => soupKeywords.some((kw) => dish.includes(kw)));
  if (soupIdx === -1 && remaining.length > 0) {
    // 국 키워드가 없으면 남은 것 중 첫 번째 요소를 국으로 지정
    soupIdx = 0;
  }
  if (soupIdx !== -1) {
    result.soup.name = remaining[soupIdx];
    remaining.splice(soupIdx, 1);
  }

  // 3. 나머지 반찬을 side1 ~ side4에 순서대로 배정
  const sideKeys = ['side1', 'side2', 'side3', 'side4'];
  sideKeys.forEach((key, i) => {
    if (i < remaining.length) {
      result[key].name = remaining[i];
    }
  });

  return result;
}

/**
 * NEIS 당일 급식 식단 불러오기
 * @param {string} officeCode - 시도교육청코드 (예: "S10")
 * @param {string} schoolCode - 행정표준학교코드 (예: "9010001")
 * @param {string} dateStr - 조회 날짜 ("YYYY-MM-DD" 또는 "YYYYMMDD")
 * @returns {Promise<{ menus: object, originInfo: string, calInfo: string, ntrInfo: string, dishList: Array<string> } | null>}
 */
export async function fetchNeisMealMenu(officeCode, schoolCode, dateStr) {
  if (!officeCode || !schoolCode || !dateStr) return null;

  const ymd = dateStr.replace(/[^0-9]/g, '');
  const apiKey = getNeisApiKey();

  const url = new URL(`${NEIS_API_BASE}/mealServiceDietInfo`);
  url.searchParams.set('KEY', apiKey);
  url.searchParams.set('Type', 'json');
  url.searchParams.set('pIndex', '1');
  url.searchParams.set('pSize', '10');
  url.searchParams.set('ATPT_OFCDC_SC_CODE', officeCode);
  url.searchParams.set('SD_SCHUL_CODE', schoolCode);
  url.searchParams.set('MLSV_YMD', ymd);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`NEIS 급식 API 오류 (상태 코드: ${res.status})`);
    }
    const data = await res.json();

    if (!data.mealServiceDietInfo || !data.mealServiceDietInfo[1] || !data.mealServiceDietInfo[1].row) {
      return null;
    }

    const rows = data.mealServiceDietInfo[1].row;
    // 중식(코드 2) 우선 선택, 없으면 첫 번째 식단 선택
    const lunchRow = rows.find(r => r.MMEAL_SC_CODE === '2') || rows[0];
    if (!lunchRow || !lunchRow.DDISH_NM) {
      return null;
    }

    const dishList = parseDdishNames(lunchRow.DDISH_NM);
    const trayMenus = mapDishesToTraySlots(dishList);

    return {
      menus: {
        rice: trayMenus.rice,
        soup: trayMenus.soup,
        side1: trayMenus.side1,
        side2: trayMenus.side2,
        side3: trayMenus.side3,
        side4: trayMenus.side4
      },
      dishList,
      calInfo: lunchRow.CAL_INFO || '',
      ntrInfo: lunchRow.NTR_INFO || '',
      originInfo: lunchRow.ORPLC_INFO || ''
    };
  } catch (err) {
    console.error('NEIS 급식 정보 조회 실패:', err);
    throw err;
  }
}

/**
 * 기존 "지역_학교명" 형식(예: "경남_김해은혜학교")의 학교 코드를 NEIS 학교 정보로 자동 매칭
 * @param {string} savedCode 
 * @returns {Promise<{ officeCode: string, schoolCode: string, schoolName: string, region: string } | null>}
 */
export async function resolveNeisSchoolFromLegacyCode(savedCode) {
  if (!savedCode) return null;

  // 1. 이미 캐시된 NEIS 정보가 있다면 바로 반환
  const cachedOffice = localStorage.getItem(`neis_office_${savedCode}`);
  const cachedSchool = localStorage.getItem(`neis_school_${savedCode}`);
  const cachedName = localStorage.getItem(`neis_name_${savedCode}`);
  const cachedRegion = localStorage.getItem(`neis_region_${savedCode}`);
  if (cachedOffice && cachedSchool) {
    return {
      officeCode: cachedOffice,
      schoolCode: cachedSchool,
      schoolName: cachedName || savedCode,
      region: cachedRegion || ''
    };
  }

  // 2. "지역_학교명" 파싱 (예: "경남_김해은혜학교")
  let region = '';
  let schoolName = savedCode;
  if (savedCode.includes('_')) {
    const parts = savedCode.split('_');
    region = parts[0];
    schoolName = parts.slice(1).join('_');
  }

  try {
    const results = await searchNeisSchools(schoolName, region);
    if (results && results.length > 0) {
      // 가장 일치하는 학교 선택
      const matched = results.find(s => s.schoolName === schoolName) || results[0];
      // 캐시 저장
      localStorage.setItem(`neis_office_${savedCode}`, matched.officeCode);
      localStorage.setItem(`neis_school_${savedCode}`, matched.schoolCode);
      localStorage.setItem(`neis_name_${savedCode}`, matched.schoolName);
      localStorage.setItem(`neis_region_${savedCode}`, matched.region);
      return matched;
    }
  } catch (e) {
    console.warn('레거시 코드 자동 매칭 실패:', e);
  }

  return null;
}
