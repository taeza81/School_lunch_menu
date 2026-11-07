/**
 * 교육부 NEIS(나이스) 공공 급식 Open API 연동 모듈
 */

const NEIS_API_BASE = 'https://open.neis.go.kr/hub';

/**
 * 시/도 교육청 코드 매핑
 */
export const REGION_OFFICE_MAP = {
  '서울': 'B10',
  '부산': 'C10',
  '대구': 'D10',
  '인천': 'E10',
  '광주': 'F10',
  '전남': 'Q10',
  '전남광주': 'F10', // 광주(F10) & 전남(Q10) 통합
  '대전': 'G10',
  '울산': 'H10',
  '세종': 'I10',
  '경기': 'J10',
  '강원': 'K10',
  '충북': 'M10',
  '충남': 'N10',
  '전북': 'P10',
  '경북': 'R10',
  '경남': 'S10',
  '제주': 'T10'
};

export const OFFICE_REGION_MAP = {
  'B10': '서울',
  'C10': '부산',
  'D10': '대구',
  'E10': '인천',
  'F10': '전남광주', // 광주 -> 전남광주 통합
  'Q10': '전남광주', // 전남 -> 전남광주 통합
  'G10': '대전',
  'H10': '울산',
  'I10': '세종',
  'J10': '경기',
  'K10': '강원',
  'M10': '충북',
  'N10': '충남',
  'P10': '전북',
  'R10': '경북',
  'S10': '경남',
  'T10': '제주'
};

/**
 * 학교 코드 표준화: '전남_' 및 '광주_' 접두사를 최신 통합 명칭인 '전남광주_'로 단일화
 */
export function normalizeSchoolCode(code) {
  if (!code) return '';
  if (code.startsWith('전남_') || code.startsWith('광주_') || code.startsWith('전라남도_') || code.startsWith('광주광역시_')) {
    const parts = code.split('_');
    return '전남광주_' + parts.slice(1).join('_');
  }
  return code;
}

/**
 * DB 호환용 대체 학교 코드 목록 반환 ('경남_' ↔ '경상남도_' 기존 데이터 호환용)
 * (전남/광주는 기존 등록 데이터가 없으므로 불필요한 레거시 조회를 생략하고 깔끔하게 직접 접근합니다)
 */
export function getAlternativeSchoolCodes(code) {
  if (!code || !code.includes('_')) return [];
  const parts = code.split('_');
  const reg = parts[0];
  const name = parts.slice(1).join('_');
  const alts = [];
  if (reg === '경남') {
    alts.push(`경상남도_${name}`);
  } else if (reg === '경상남도') {
    alts.push(`경남_${name}`);
  }
  return alts;
}

/**
 * 지역명을 표준 규격으로 통일
 * 정부 NEIS DB 및 행정 통합에 맞추어 '전남'과 '광주'를 모두 '전남광주'로 자동 재명명
 */
export function normalizeRegion(region, officeCode = '') {
  if (officeCode === 'F10' || officeCode === 'Q10') {
    return '전남광주';
  }
  if (officeCode && OFFICE_REGION_MAP[officeCode]) {
    return OFFICE_REGION_MAP[officeCode];
  }
  if (!region) return '';
  const r = region.trim();
  // 전남, 광주, 전라남도, 광주광역시는 모두 '전남광주'로 통합
  if (r.includes('광주') || r.startsWith('전남') || r.startsWith('전라남')) {
    return '전남광주';
  }
  if (r.startsWith('서울')) return '서울';
  if (r.startsWith('부산')) return '부산';
  if (r.startsWith('대구')) return '대구';
  if (r.startsWith('인천')) return '인천';
  if (r.startsWith('대전')) return '대전';
  if (r.startsWith('울산')) return '울산';
  if (r.startsWith('세종')) return '세종';
  if (r.startsWith('경기')) return '경기';
  if (r.startsWith('강원')) return '강원';
  if (r.startsWith('충청북') || r === '충북') return '충북';
  if (r.startsWith('충청남') || r === '충남') return '충남';
  if (r.startsWith('전라북') || r === '전북') return '전북';
  if (r.startsWith('경상북') || r === '경북') return '경북';
  if (r.startsWith('경상남') || r === '경남') return '경남';
  if (r.startsWith('제주')) return '제주';
  return r.slice(0, 2);
}

/**
 * 환경변수 또는 발급받은 NEIS API 키 반환
 */
export function getNeisApiKey() {
  return (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_NEIS_API_KEY) || 'd765dc21b0d94369aab17c18d89e51fe';
}

/**
 * 전국 학교 검색 API (특수학교, 초등학교, 중학교, 고등학교 등 전체 지원)
 * @param {string} keyword - 학교 이름 (예: "은혜학교", "김해가야")
 * @param {string} region - 지역 필터 (선택 사항, 예: "경남", "전남광주", "전체")
 * @param {string} schoolKind - 학교 종류 필터 (선택 사항, 예: "특수학교", "초등학교", "중학교", "고등학교")
 * @returns {Promise<Array<{ officeCode: string, officeName: string, schoolCode: string, schoolName: string, region: string, address: string, schoolKind: string }>>}
 */
export async function searchNeisSchools(keyword, region = '', schoolKind = '') {
  const cleanKeyword = (keyword || '').trim();
  if (!cleanKeyword) return [];

  const apiKey = getNeisApiKey();
  const normRegion = normalizeRegion(region);

  const fetchOfficeSchools = async (officeCode = '') => {
    const url = new URL(`${NEIS_API_BASE}/schoolInfo`);
    url.searchParams.set('KEY', apiKey);
    url.searchParams.set('Type', 'json');
    url.searchParams.set('pIndex', '1');
    url.searchParams.set('pSize', '100'); // 충분한 크기로 누락 방지
    url.searchParams.set('SCHUL_NM', cleanKeyword);
    if (officeCode) {
      url.searchParams.set('ATPT_OFCDC_SC_CODE', officeCode);
    }
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.schoolInfo || !data.schoolInfo[1] || !data.schoolInfo[1].row) {
      return [];
    }
    return data.schoolInfo[1].row;
  };

  try {
    let rows = [];
    if (normRegion === '전남광주') {
      // 전남광주 선택 시 광주(F10)와 전남(Q10) 양쪽 교육청 데이터를 병렬 조회하여 완벽 통합!
      const [gwangjuRows, jeonnamRows] = await Promise.all([
        fetchOfficeSchools('F10'),
        fetchOfficeSchools('Q10')
      ]);
      rows = [...gwangjuRows, ...jeonnamRows];
    } else if (normRegion && REGION_OFFICE_MAP[normRegion]) {
      rows = await fetchOfficeSchools(REGION_OFFICE_MAP[normRegion]);
    } else {
      rows = await fetchOfficeSchools('');
    }

    let schools = rows.map((item) => ({
      officeCode: item.ATPT_OFCDC_SC_CODE, // 관할 교육청 코드 (예: F10, Q10, S10)
      officeName: item.ATPT_OFCDC_SC_NM,   // 교육청 명칭 (예: 광주광역시교육청, 전라남도교육청)
      schoolCode: item.SD_SCHUL_CODE,      // 행정 표준 학교 코드 (예: 9010536)
      schoolName: item.SCHUL_NM,           // 학교명
      region: normalizeRegion(item.LCTN_SC_NM, item.ATPT_OFCDC_SC_CODE) || '기타', // '전남광주'로 완벽 통합 재명명
      address: item.ORG_RDNMA || item.ORG_RDNDA || item.ORG_RDNZC || '', // 도로명 주소
      schoolKind: item.SCHUL_KND_SC_NM || '학교'       // 특수학교/초등학교/중학교/고등학교 등
    }));

    // 지역 필터링 (전체 지역 검색 시 후처리 보강)
    if (normRegion) {
      schools = schools.filter(s => s.region === normRegion || s.officeName.includes(normRegion));
    }

    // 학교 종류 필터링 (특수학교 / 초등학교 / 중학교 / 고등학교)
    if (schoolKind && schoolKind !== '전체') {
      schools = schools.filter(s => s.schoolKind === schoolKind || s.schoolKind.includes(schoolKind));
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
  const normCode = normalizeSchoolCode(savedCode);

  // 1. 이미 캐시된 NEIS 정보가 있다면 바로 반환 (정규화된 코드 및 원본 코드 모두 체크)
  const cachedOffice = localStorage.getItem(`neis_office_${normCode}`) || localStorage.getItem(`neis_office_${savedCode}`);
  const cachedSchool = localStorage.getItem(`neis_school_${normCode}`) || localStorage.getItem(`neis_school_${savedCode}`);
  const cachedName = localStorage.getItem(`neis_name_${normCode}`) || localStorage.getItem(`neis_name_${savedCode}`);
  const cachedRegion = localStorage.getItem(`neis_region_${normCode}`) || localStorage.getItem(`neis_region_${savedCode}`);
  if (cachedOffice && cachedSchool) {
    return {
      officeCode: cachedOffice,
      schoolCode: cachedSchool,
      schoolName: cachedName || normCode,
      region: cachedRegion || ''
    };
  }

  // 2. "지역_학교명" 파싱 (예: "경남_김해은혜학교", "전남광주_여수여명학교")
  let region = '';
  let schoolName = normCode;
  if (normCode.includes('_')) {
    const parts = normCode.split('_');
    region = parts[0];
    schoolName = parts.slice(1).join('_');
  }

  try {
    const results = await searchNeisSchools(schoolName, region);
    if (results && results.length > 0) {
      // 가장 일치하는 학교 선택
      const matched = results.find(s => s.schoolName === schoolName) || results[0];
      // 캐시 저장 (새 코드와 과거 코드 둘 다 저장하여 상호 호환 보장)
      [normCode, savedCode].forEach(c => {
        localStorage.setItem(`neis_office_${c}`, matched.officeCode);
        localStorage.setItem(`neis_school_${c}`, matched.schoolCode);
        localStorage.setItem(`neis_name_${c}`, matched.schoolName);
        localStorage.setItem(`neis_region_${c}`, matched.region);
      });
      return matched;
    }
  } catch (e) {
    console.warn('레거시 코드 자동 매칭 실패:', e);
  }

  return null;
}
