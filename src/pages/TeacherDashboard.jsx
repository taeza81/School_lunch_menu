import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db, signInWithGoogle, logoutUser } from '../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore'
import { compressImage } from '../utils/imageCompressor'
import { searchNeisSchools, fetchNeisMealMenu, resolveNeisSchoolFromLegacyCode, normalizeRegion, normalizeSchoolCode, getAlternativeSchoolCodes } from '../utils/neisApi'

const DEFAULT_SCHOOL_CODE = '경남_김해은혜학교'
const regions = ["서울", "부산", "대구", "인천", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남광주", "경북", "경남", "제주"]

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  const getInitialSchoolCode = () => {
    let saved = localStorage.getItem('schoolCode') || ''
    if (saved) {
      saved = normalizeSchoolCode(saved)
      localStorage.setItem('schoolCode', saved)
    }
    return saved
  }

  const [schoolCode, setSchoolCode] = useState(getInitialSchoolCode)
  const [isSchoolCodeSet, setIsSchoolCodeSet] = useState(!!localStorage.getItem('schoolCode'))
  
  // 학교 검색 모달 및 상태
  const [showSchoolSearchModal, setShowSchoolSearchModal] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchRegionFilter, setSearchRegionFilter] = useState('') // 기본값: 전체 지역
  const [searchKindFilter, setSearchKindFilter] = useState('전체') // 기본값: 전체 종류
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('useLocalMock') === 'true') {
      setUser({ email: 'guest@test.com (로컬 테스트 모드)', displayName: '테스트 교사' })
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser && localStorage.getItem('useLocalMock') !== 'true') {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
          if (userDoc.exists() && userDoc.data().schoolCode) {
            const data = userDoc.data();
            const code = normalizeSchoolCode(data.schoolCode);
            setSchoolCode(code)
            setIsSchoolCodeSet(true)
            localStorage.setItem('schoolCode', code)
            if (data.neisOfficeCode) localStorage.setItem(`neis_office_${code}`, data.neisOfficeCode)
            if (data.neisSchoolCode) localStorage.setItem(`neis_school_${code}`, data.neisSchoolCode)
            if (data.schoolName) localStorage.setItem(`neis_name_${code}`, data.schoolName)
            if (data.region) localStorage.setItem(`neis_region_${code}`, normalizeRegion(data.region, data.neisOfficeCode))
          } else {
            // 구글 계정에 아직 학교 코드가 등록되지 않은 경우 학교 등록 화면을 띄움
            setIsSchoolCodeSet(false)
          }
        } catch(e) { 
          console.error(e) 
        }
      }
    })
    return () => unsubscribe()
  }, [])

  // Google 원클릭 로그인 핸들러
  const handleGoogleLogin = async () => {
    try {
      localStorage.setItem('useLocalMock', 'false')
      const result = await signInWithGoogle()
      const loggedUser = result.user

      // Firestore에서 등록된 학교 정보 조회
      const userDoc = await getDoc(doc(db, 'users', loggedUser.uid))
      if (userDoc.exists() && userDoc.data().schoolCode) {
        const data = userDoc.data()
        const code = data.schoolCode
        setSchoolCode(code)
        setIsSchoolCodeSet(true)
        localStorage.setItem('schoolCode', code)
        if (data.neisOfficeCode) localStorage.setItem(`neis_office_${code}`, data.neisOfficeCode)
        if (data.neisSchoolCode) localStorage.setItem(`neis_school_${code}`, data.neisSchoolCode)
      } else {
        // 구글 계정에 등록된 학교 정보가 없으면 학교 등록 화면 띄우기
        setIsSchoolCodeSet(false)
      }
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user') return
      alert("Google 로그인 오류: " + error.message)
    }
  }

  // NEIS 전국 학교 검색 실행 (초/중/고/특수학교 전체 지원)
  const handleSearchNeis = async (e) => {
    if (e) e.preventDefault()
    if (!searchKeyword.trim()) {
      return alert("검색할 학교 이름을 2글자 이상 입력해주세요.")
    }
    setIsSearching(true)
    try {
      const list = await searchNeisSchools(searchKeyword.trim(), searchRegionFilter, searchKindFilter)
      setSearchResults(list)
      if (list.length === 0) {
        alert("검색 결과가 없습니다. 학교명이나 필터 조건을 다시 확인해 주세요.")
      }
    } catch (err) {
      alert("나이스 학교 검색 실패: " + err.message)
    } finally {
      setIsSearching(false)
    }
  }

  // 검색된 NEIS 학교 선택 적용
  const handleSelectNeisSchool = async (selected) => {
    const cleanRegion = normalizeRegion(selected.region, selected.officeCode) || '경남'
    const code = normalizeSchoolCode(`${cleanRegion}_${selected.schoolName.replace(/\s+/g, '')}`)
    
    // 캐시 및 로컬스토리지 저장
    localStorage.setItem('schoolCode', code)
    localStorage.setItem(`neis_office_${code}`, selected.officeCode)
    localStorage.setItem(`neis_school_${code}`, selected.schoolCode)
    localStorage.setItem(`neis_name_${code}`, selected.schoolName)
    localStorage.setItem(`neis_region_${code}`, cleanRegion)
    localStorage.setItem('neisOfficeCode', selected.officeCode)
    localStorage.setItem('neisSchoolCode', selected.schoolCode)

    setSchoolCode(code)
    setIsSchoolCodeSet(true)

    // Firebase 유저 정보 저장 (현재 로그인한 구글 계정에 학교 정보 영구 연결)
    if (user && user.uid && localStorage.getItem('useLocalMock') !== 'true') {
      try {
        await setDoc(doc(db, 'users', user.uid), { 
          schoolCode: code,
          neisOfficeCode: selected.officeCode,
          neisSchoolCode: selected.schoolCode,
          schoolName: selected.schoolName,
          region: cleanRegion,
          schoolKind: selected.schoolKind || '',
          email: user.email || ''
        }, { merge: true })
      } catch (err) {
        console.warn("사용자 정보 저장 경고:", err)
      }
    }

    setShowSchoolSearchModal(false)
    alert(`🎉 [${selected.schoolName}](${cleanRegion})이(가) 성공적으로 연결되었습니다!`)
  }

  const handleLogout = async () => {
    localStorage.removeItem('useLocalMock')
    // 주의: 기존 학교 데이터를 잃어버리지 않도록 schoolCode는 로컬스토리지에 안전하게 보존합니다.
    setUser(null)
    
    if (localStorage.getItem('useLocalMock') !== 'true') {
      await logoutUser()
    }
    
    navigate('/')
  }

  // 1. 미로그인 상태 화면 (오직 Google 로그인만 제공)
  if (!user) {
    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4 relative">
        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl w-full max-w-md text-center">
          <div className="flex flex-col items-center justify-center gap-3 mb-8">
            <div className="w-20 h-20 rounded-full overflow-hidden shadow-md border-4 border-white shrink-0 bg-white">
              <img src={`${import.meta.env.BASE_URL}teacher_icon.jpg`} alt="선생님" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800 tracking-tight">교사 로그인</h1>
            <p className="text-sm text-gray-500 font-medium">선생님 계정은 Google 간편 로그인으로만 연결됩니다.</p>
          </div>

          {/* Google 원클릭 간편 로그인 버튼만 단독 표시 */}
          <button 
            type="button" 
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 active:scale-[0.98] text-gray-700 font-extrabold py-4 px-6 rounded-2xl shadow-md hover:shadow-lg transition-all text-base md:text-lg mb-6 cursor-pointer"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Google 계정으로 로그인</span>
          </button>

          <div className="pt-4 border-t border-gray-100 flex justify-center">
            <Link to="/" className="text-gray-400 text-sm font-bold hover:text-gray-600 transition-colors flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              메인으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 2. 구글 로그인 완료 후, 계정에 학교 정보가 아직 연결되지 않은 경우
  // -> 학교 정보를 검색하여 넣는 단계 직접 제시
  if (user && !isSchoolCodeSet) {
    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4">
        <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl w-full max-w-xl text-center border-t-8 border-pastel-yellow">
          <div className="w-14 h-14 mx-auto mb-3 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-3xl">
            🏫
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold mb-2 text-gray-800">학교 정보 등록하기</h2>
          <p className="text-sm text-gray-500 mb-6 font-medium">
            환영합니다! <b>{user.displayName || user.email}</b> 선생님의 소속 학교를 검색하여 연결해 주세요.
          </p>

          {/* 기존 김해은혜학교 데이터 1초 빠른 연결 추천 카드 */}
          <div className="bg-emerald-50 border-2 border-emerald-300 p-4 rounded-2xl mb-6 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="font-extrabold text-emerald-900 text-base">🏫 김해은혜학교 (기존 등록 데이터)</span>
              <span className="bg-emerald-200 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-black">추천</span>
            </div>
            <p className="text-xs text-emerald-700 mb-3">
              기존에 선생님들이 등록해 두신 김해은혜학교의 모든 식단 데이터와 즉시 연동됩니다.
            </p>
            <button
              type="button"
              onClick={() => handleSelectNeisSchool({
                schoolName: '김해은혜학교',
                region: '경남',
                officeCode: 'S10',
                schoolCode: '9010536',
                officeName: '경상남도교육청',
                schoolKind: '특수학교'
              })}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm cursor-pointer"
            >
              👉 김해은혜학교로 바로 시작하기
            </button>
          </div>

          <div className="relative flex py-2 items-center mb-6">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-4 text-xs font-bold text-gray-400">또는 다른 학교 검색하기</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          {/* 전국 학교 직접 검색 UI (특수/초/중/고 전체 지원) */}
          <form onSubmit={handleSearchNeis} className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="flex gap-2">
              <select 
                value={searchRegionFilter} 
                onChange={(e) => setSearchRegionFilter(e.target.value)}
                className="border-2 border-gray-200 p-2.5 rounded-xl font-bold text-gray-700 text-sm bg-white"
              >
                <option value="">전체 지역</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select 
                value={searchKindFilter} 
                onChange={(e) => setSearchKindFilter(e.target.value)}
                className="border-2 border-gray-200 p-2.5 rounded-xl font-bold text-gray-700 text-sm bg-white"
              >
                <option value="전체">학교급</option>
                <option value="특수학교">특수학교</option>
                <option value="초등학교">초등학교</option>
                <option value="중학교">중학교</option>
                <option value="고등학교">고등학교</option>
              </select>
            </div>
            <input 
              type="text" 
              placeholder="공식 학교명을 입력해 주세요." 
              className="flex-1 border-2 border-gray-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-gray-800 text-sm"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            <button 
              type="submit" 
              disabled={isSearching}
              className="bg-pastel-blue hover:bg-blue-300 text-gray-800 px-5 py-2.5 rounded-xl font-black text-sm shadow-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? '검색 중' : '검색'}
            </button>
          </form>

          {/* 검색 결과 리스트 */}
          {searchResults.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-200 p-2 rounded-2xl bg-gray-50 text-left mb-4">
              {searchResults.map((item) => (
                <div 
                  key={`${item.officeCode}_${item.schoolCode}`}
                  className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-gray-900 text-sm">{item.schoolName}</span>
                      <span className="text-xs text-gray-500">{item.region}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate max-w-xs">{item.address || item.officeName}</p>
                  </div>
                  <button 
                    onClick={() => handleSelectNeisSchool(item)}
                    className="bg-pastel-blue hover:bg-blue-300 text-gray-800 font-black px-3 py-1.5 rounded-lg text-xs transition-colors shadow-sm shrink-0 cursor-pointer"
                  >
                    선택
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
            <button onClick={handleLogout} className="hover:text-red-500 cursor-pointer font-bold">
              다른 계정으로 로그인
            </button>
            <Link to="/" className="hover:text-gray-600 font-bold">
              메인으로 이동
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 3. 교사 대시보드 메인 화면
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/20 to-indigo-50/30 p-3 sm:p-5 md:p-8">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* 상단 네비게이션 헤더 바 */}
        <header className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-sm px-4 md:px-6 py-3.5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3.5 w-full md:w-auto">
            <div className="w-11 h-11 md:w-12 md:h-12 rounded-2xl overflow-hidden shadow-inner border border-slate-200 bg-white shrink-0 p-0.5">
              <img src={`${import.meta.env.BASE_URL}teacher_icon.jpg`} alt="선생님" className="w-full h-full object-cover rounded-xl" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">선생님 관리자 대시보드</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-black px-2.5 py-0.5 rounded-full shadow-2xs">
                  <span>🏫</span> {schoolCode || '학교 미설정'}
                </span>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">| {user.email}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            <button 
              onClick={() => setShowSchoolSearchModal(true)} 
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>🔍</span> 학교 변경
            </button>
            <Link 
              to="/" 
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              학생 화면
            </Link>
            <button 
              onClick={handleLogout} 
              className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-3 py-2 rounded-xl text-xs md:text-sm font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              로그아웃
            </button>
          </div>
        </header>
        
        <MenuEditor schoolCode={schoolCode} />

        {/* 전국 학교 검색 모달 */}
        {showSchoolSearchModal && (
          <SchoolSearchModal
            searchKeyword={searchKeyword}
            setSearchKeyword={setSearchKeyword}
            searchRegionFilter={searchRegionFilter}
            setSearchRegionFilter={setSearchRegionFilter}
            searchKindFilter={searchKindFilter}
            setSearchKindFilter={setSearchKindFilter}
            searchResults={searchResults}
            isSearching={isSearching}
            onSearch={handleSearchNeis}
            onSelect={handleSelectNeisSchool}
            onClose={() => setShowSchoolSearchModal(false)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * 전국 학교 검색 모달 컴포넌트
 */
function SchoolSearchModal({
  searchKeyword,
  setSearchKeyword,
  searchRegionFilter,
  setSearchRegionFilter,
  searchKindFilter,
  setSearchKindFilter,
  searchResults,
  isSearching,
  onSearch,
  onSelect,
  onClose
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-6 md:p-7 max-w-xl w-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-extrabold text-gray-800">🏫 전국 학교 검색 (NEIS 연동)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold cursor-pointer">✕</button>
        </div>

        <form onSubmit={onSearch} className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="flex gap-2">
            <select 
              value={searchRegionFilter} 
              onChange={(e) => setSearchRegionFilter(e.target.value)}
              className="border-2 border-gray-200 p-2.5 rounded-xl font-bold text-gray-700 text-sm bg-white"
            >
              <option value="">전체 지역</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select 
              value={searchKindFilter} 
              onChange={(e) => setSearchKindFilter(e.target.value)}
              className="border-2 border-gray-200 p-2.5 rounded-xl font-bold text-gray-700 text-sm bg-white"
            >
              <option value="전체">학교급</option>
              <option value="특수학교">특수학교</option>
              <option value="초등학교">초등학교</option>
              <option value="중학교">중학교</option>
              <option value="고등학교">고등학교</option>
            </select>
          </div>
          <input 
            type="text" 
            placeholder="공식 학교명을 입력해 주세요." 
            className="flex-1 border-2 border-gray-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-gray-800 text-sm"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            autoFocus
          />
          <button 
            type="submit" 
            disabled={isSearching}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-extrabold text-sm shadow-md transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isSearching ? '검색 중...' : '검색'}
          </button>
        </form>

        <div className={`overflow-y-auto space-y-2 pr-1 border border-gray-100 p-2 rounded-2xl bg-gray-50 ${searchResults.length === 0 ? 'py-4 text-center' : 'max-h-[360px]'}`}>
          {searchResults.length === 0 ? (
            <div className="text-gray-400 font-medium text-xs md:text-sm">
              학교명을 입력하고 [검색] 버튼을 눌러주세요.
            </div>
          ) : (
            searchResults.map((item) => (
              <div 
                key={`${item.officeCode}_${item.schoolCode}`}
                className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-gray-900 text-base">{item.schoolName}</span>
                    <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                      {item.schoolKind}
                    </span>
                    <span className="text-xs text-gray-500">{item.region}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-md">{item.address || item.officeName}</p>
                </div>
                <button 
                  onClick={() => onSelect(item)}
                  className="bg-pastel-blue hover:bg-blue-300 text-gray-800 font-extrabold px-4 py-2 rounded-xl text-sm transition-colors shadow-sm shrink-0 cursor-pointer"
                >
                  선택
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Google 공식 4색 로고 SVG 아이콘
const GoogleIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
)

const MenuInputSlot = ({ keyName, item, label, handleMenuChange, handleImageUpload }) => {
  const [isDragging, setIsDragging] = useState(false)

  const handleGoogleSearch = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const query = item.name && item.name.trim() ? `${item.name.trim()} 음식` : '급식 메뉴'
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`, '_blank')
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(keyName, e.dataTransfer.files[0])
    }
  }

  return (
    <div className="bg-white rounded-2xl p-2.5 md:p-3 shadow-sm border border-slate-200/90 flex flex-col gap-2 transition-all duration-200 hover:border-indigo-400 hover:shadow-md h-full min-h-0 group">
      {/* 슬롯 헤더 */}
      <div className="flex items-center justify-between">
        <span className="bg-slate-100 text-slate-700 font-extrabold px-3 py-1 rounded-full text-xs tracking-tight border border-slate-200">
          {label}
        </span>
        {item.imageUrl && (
          <button 
            type="button"
            onClick={() => handleMenuChange(keyName, 'imageUrl', '')}
            className="text-[11px] text-rose-500 hover:text-rose-700 font-bold transition-colors cursor-pointer"
            title="이미지 삭제"
          >
            ✕ 삭제
          </button>
        )}
      </div>
      
      {/* 사진 프리뷰 또는 업로드 영역 (클릭 및 드래그&드랍 지원) */}
      <div className="relative w-full flex-1 min-h-0 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 flex flex-col items-center justify-center">
        {item.imageUrl ? (
          <div className="w-full h-full p-1.5 flex items-center justify-center relative group/img">
            <img src={item.imageUrl} alt={item.name} className="object-contain w-full h-full rounded-lg" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
              <label className="bg-white text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg shadow cursor-pointer hover:bg-slate-50 transition-transform active:scale-95">
                사진 변경
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => handleImageUpload(keyName, e.target.files[0])}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-between p-2 relative">
            {/* 파일 업로드 드롭존 (클릭 및 드래그&드랍 모두 완벽 지원) */}
            <label 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-all cursor-pointer p-1.5 mb-1.5 group/upload ${
                isDragging 
                  ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' 
                  : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 md:h-6 md:w-6 transition-all mb-0.5 ${isDragging ? 'text-indigo-600 scale-110 animate-bounce' : 'text-slate-400 group-hover/upload:text-indigo-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className={`text-[11px] font-bold transition-colors text-center ${isDragging ? 'text-indigo-600' : 'text-slate-500 group-hover/upload:text-indigo-600'}`}>
                {isDragging ? '여기에 사진을 놓으세요!' : '사진 클릭 또는 끌어다 놓기'}
              </span>
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => handleImageUpload(keyName, e.target.files[0])}
                className="hidden"
              />
            </label>

            {/* 웹 이미지 URL 입력창 + 구글 원클릭 이미지 검색 버튼 */}
            <div className="w-full flex gap-1 items-center">
              <input 
                type="text" 
                placeholder="웹 이미지 URL" 
                value={item.imageUrl}
                onChange={(e) => handleMenuChange(keyName, 'imageUrl', e.target.value)}
                className="flex-1 min-w-0 border border-slate-200 px-2 py-1 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white placeholder-slate-400 shadow-2xs"
              />
              <button
                type="button"
                onClick={handleGoogleSearch}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-2 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
                title="새 탭에서 구글 이미지 검색 열기"
              >
                <GoogleIcon />
                <span className="text-[11px] font-black">구글</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 메뉴명 입력 인풋 */}
      <div>
        <input 
          type="text" 
          placeholder="메뉴 입력" 
          value={item.name}
          onChange={(e) => handleMenuChange(keyName, 'name', e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 focus:bg-white p-1.5 md:p-2 rounded-xl text-center font-black text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-sm md:text-base shadow-2xs"
        />
      </div>
    </div>
  )
}

function MenuEditor({ schoolCode }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [savedDates, setSavedDates] = useState([])
  const [hasAutoLoadedRecent, setHasAutoLoadedRecent] = useState(false)
  const [menus, setMenus] = useState({
    rice: { name: '', imageUrl: '', type: 'rice' },
    soup: { name: '', imageUrl: '', type: 'soup' },
    side1: { name: '', imageUrl: '', type: 'side1' },
    side2: { name: '', imageUrl: '', type: 'side2' },
    side3: { name: '', imageUrl: '', type: 'side3' },
    side4: { name: '', imageUrl: '', type: 'side4' },
  })
  const [saving, setSaving] = useState(false)
  const [loadingNeis, setLoadingNeis] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  // 1. 등록된 모든 식단 날짜 목록 불러오기 (과거 8~9월 식단 즉시 확인 지원)
  const refreshSavedDates = async () => {
    if (!schoolCode) return
    const isMock = localStorage.getItem('useLocalMock') === 'true'
    const dates = []
    try {
      if (!isMock) {
        const snapshot = await getDocs(collection(db, 'schools', schoolCode, 'menus'))
        snapshot.forEach(d => dates.push(d.id))
        
        // 지역명 호환성: 전남광주_ ↔ 전남_ / 광주_, 경남_ ↔ 경상남도_ 등 과거 등록 데이터 연동
        if (dates.length === 0) {
          const alts = getAlternativeSchoolCodes(schoolCode);
          for (const altCode of alts) {
            try {
              const altSnap = await getDocs(collection(db, 'schools', altCode, 'menus'));
              altSnap.forEach(d => {
                if (!dates.includes(d.id)) dates.push(d.id);
              });
              if (dates.length > 0) break;
            } catch (e) { /* ignore */ }
          }
        }
      } else {
        const checkCodes = [schoolCode, ...getAlternativeSchoolCodes(schoolCode)];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key) continue;
          for (const c of checkCodes) {
            if (key.startsWith(`menus_${c}_`)) {
              const dStr = key.replace(`menus_${c}_`, '');
              if (!dates.includes(dStr)) dates.push(dStr);
            }
          }
        }
      }

      dates.sort().reverse() // 최신 날짜 우선
      setSavedDates(dates)

      // 첫 진입 시 오늘 날짜에 메뉴가 없고 등록된 식단이 있다면, 가장 최근 등록된 식단 날짜로 자동 이동
      if (!hasAutoLoadedRecent && dates.length > 0) {
        const today = new Date().toISOString().split('T')[0]
        if (!dates.includes(today)) {
          setDate(dates[0])
        }
        setHasAutoLoadedRecent(true)
      }
    } catch (err) {
      console.warn("등록된 식단 날짜 목록 로드 실패:", err)
    }
  }

  useEffect(() => {
    refreshSavedDates()
  }, [schoolCode])

  const handleMenuChange = (key, field, value) => {
    setMenus(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }))
  }

  // 식판 사진 고효율 압축(480px, 0.55 품질) 적용
  const handleImageUpload = async (key, file) => {
    if (!file) return;
    try {
      const { dataUrl, originalSize, compressedSize } = await compressImage(file, { maxSize: 480, quality: 0.55 });
      handleMenuChange(key, 'imageUrl', dataUrl);
      const origKb = (originalSize / 1024).toFixed(1);
      const compKb = (compressedSize / 1024).toFixed(1);
      setStatusMessage(`📸 사진 압축 완료: ${origKb}KB → ${compKb}KB (480px, 품질 0.55 고효율 최적화)`);
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (error) {
      alert("이미지 압축 처리 실패: " + error.message)
    }
  }

  const fetchMenu = async () => {
    if (!schoolCode) return
    const isMock = localStorage.getItem('useLocalMock') === 'true'
    try {
      if (isMock) {
        let localData = localStorage.getItem(`menus_${schoolCode}_${date}`)
        if (!localData) {
          const alts = getAlternativeSchoolCodes(schoolCode)
          for (const altCode of alts) {
            const d = localStorage.getItem(`menus_${altCode}_${date}`)
            if (d) { localData = d; break; }
          }
        }
        if (localData) {
          setMenus(JSON.parse(localData))
          return
        }
      } else {
        const docRef = doc(db, 'schools', schoolCode, 'menus', date)
        let docSnap = await getDoc(docRef)
        
        // 지역명 호환성 체크 (전남광주_ ↔ 전남_ / 광주_, 경남_ ↔ 경상남도_)
        if (!docSnap.exists()) {
          const alts = getAlternativeSchoolCodes(schoolCode);
          for (const altCode of alts) {
            try {
              const altSnap = await getDoc(doc(db, 'schools', altCode, 'menus', date));
              if (altSnap.exists()) {
                docSnap = altSnap;
                break;
              }
            } catch (e) { /* ignore */ }
          }
        }

        if (docSnap.exists()) {
          setMenus(docSnap.data().menus)
          return
        }
      }
    } catch (error) {
      console.error(error)
      let localData = localStorage.getItem(`menus_${schoolCode}_${date}`)
      if (!localData) {
        const alts = getAlternativeSchoolCodes(schoolCode)
        for (const altCode of alts) {
          const d = localStorage.getItem(`menus_${altCode}_${date}`)
          if (d) { localData = d; break; }
        }
      }
      if (localData) {
        setMenus(JSON.parse(localData))
        return
      }
    }
    
    setMenus({
      rice: { name: '', imageUrl: '', type: 'rice' },
      soup: { name: '', imageUrl: '', type: 'soup' },
      side1: { name: '', imageUrl: '', type: 'side1' },
      side2: { name: '', imageUrl: '', type: 'side2' },
      side3: { name: '', imageUrl: '', type: 'side3' },
      side4: { name: '', imageUrl: '', type: 'side4' },
    })
  }

  useEffect(() => {
    fetchMenu()
  }, [date, schoolCode])

  // NEIS 당일 식단 1초 불러오기
  const handleFetchNeisToday = async () => {
    setLoadingNeis(true)
    setStatusMessage('')
    try {
      // 1. NEIS 학교 코드 조회 (없으면 레거시 코드 자동 매칭)
      let officeCode = localStorage.getItem(`neis_office_${schoolCode}`) || localStorage.getItem('neisOfficeCode')
      let neisSchoolCode = localStorage.getItem(`neis_school_${schoolCode}`) || localStorage.getItem('neisSchoolCode')

      if (!officeCode || !neisSchoolCode) {
        const resolved = await resolveNeisSchoolFromLegacyCode(schoolCode)
        if (resolved) {
          officeCode = resolved.officeCode
          neisSchoolCode = resolved.schoolCode
        }
      }

      if (!officeCode || !neisSchoolCode) {
        alert("해당 학교의 나이스(NEIS) 코드를 찾지 못했습니다. 상단 [학교 변경/검색]에서 학교를 검색하여 선택해주세요.")
        setLoadingNeis(false)
        return
      }

      // 2. NEIS 급식 정보 호출
      const neisData = await fetchNeisMealMenu(officeCode, neisSchoolCode, date)
      if (!neisData || !neisData.dishList || neisData.dishList.length === 0) {
        alert(`선택한 날짜(${date})에는 나이스에 등록된 급식 식단이 없습니다. (주말, 공휴일 또는 방학일 수 있습니다)`)
        setLoadingNeis(false)
        return
      }

      // 3. 기존 등록 사진 유지하며 메뉴 이름 자동 채우기
      setMenus(prev => {
        const newMenus = { ...neisData.menus }
        Object.keys(newMenus).forEach(slot => {
          if (prev[slot] && prev[slot].imageUrl) {
            newMenus[slot].imageUrl = prev[slot].imageUrl
          }
        })
        return newMenus
      })

      // 3번 요청 반영: "(예: 오늘의 급식 메뉴는 753.3 Kcal 입니다.)" 형식으로 단정하게 표기
      const calInfoStr = neisData.calInfo || ''
      setStatusMessage(calInfoStr ? `오늘의 급식 메뉴는 ${calInfoStr} 입니다.` : '오늘의 급식 메뉴를 성공적으로 불러왔습니다.')
    } catch (err) {
      console.error(err)
      alert("나이스 급식 불러오기 오류: " + err.message)
    } finally {
      setLoadingNeis(false)
    }
  }

  const saveMenu = async () => {
    setSaving(true)
    const isMock = localStorage.getItem('useLocalMock') === 'true'
    try {
      if (isMock) {
        localStorage.setItem(`menus_${schoolCode}_${date}`, JSON.stringify(menus))
        alert("로컬 저장소에 저장되었습니다! (테스트 모드)")
      } else {
        await setDoc(doc(db, 'schools', schoolCode, 'menus', date), { menus })
        alert("저장되었습니다!")
      }
      refreshSavedDates()
    } catch (error) {
      alert("Firebase 연동 실패. 로컬에 임시 저장합니다.\n에러: " + error.message)
      localStorage.setItem(`menus_${schoolCode}_${date}`, JSON.stringify(menus))
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-3xl shadow-md p-4 sm:p-6 md:p-8 border border-slate-200/80">
      {/* 등록된 식단 날짜 퀵 바로가기 칩 (과거 8~9월 식단 즉시 확인) */}
      {savedDates.length > 0 && (
        <div className="mb-5 bg-slate-50 border border-slate-200 p-3 md:p-3.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex items-center gap-2 text-xs md:text-sm font-black text-slate-800 shrink-0">
            <span className="text-indigo-600">📅</span>
            <span>선생님 등록 식단 목록 ({savedDates.length}일):</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
            {savedDates.slice(0, 8).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                  date === d 
                    ? 'bg-indigo-600 text-white shadow-sm scale-105' 
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                }`}
              >
                {d}
              </button>
            ))}
            {savedDates.length > 8 && (
              <span className="text-xs text-slate-500 font-bold shrink-0">외 {savedDates.length - 8}일</span>
            )}
          </div>
        </div>
      )}

      {/* 날짜 선택 및 나이스 1초 로드 툴바 */}
      <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-3.5 bg-slate-50 border border-slate-200/90 p-3.5 md:p-4 rounded-2xl">
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <label className="font-extrabold text-slate-700 whitespace-nowrap text-xs md:text-sm flex items-center gap-1">
            <span>🗓️</span> 날짜:
          </label>
          <input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="bg-white border border-slate-300 px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-slate-800 w-full md:w-auto shadow-2xs text-xs md:text-sm cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* 나이스 당일 식단 1초 불러오기 버튼 */}
          <button
            onClick={handleFetchNeisToday}
            disabled={loadingNeis}
            className="flex-1 md:flex-none bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black py-2.5 px-4 md:px-5 rounded-xl transition-all shadow-2xs hover:shadow disabled:opacity-50 flex items-center justify-center gap-1.5 text-xs md:text-sm cursor-pointer active:scale-95"
          >
            {loadingNeis ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                불러오는 중...
              </>
            ) : (
              <>
                <span>⚡</span> 나이스 당일 식단 1초 불러오기
              </>
            )}
          </button>
          
          <button 
            onClick={saveMenu} 
            disabled={saving}
            className="flex-1 md:flex-none bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-2.5 px-5 md:px-6 rounded-xl transition-all shadow-2xs hover:shadow disabled:opacity-50 flex items-center justify-center gap-1.5 text-xs md:text-sm cursor-pointer active:scale-95"
          >
            {saving ? '저장 중...' : '💾 메뉴 저장하기'}
          </button>
        </div>
      </div>

      {/* 나이스 식단 열량 안내 배너 (3번 요청 예시 형식) */}
      {statusMessage && (
        <div className="mb-5 bg-sky-50 text-sky-900 border border-sky-200/90 px-4 py-3 rounded-2xl text-xs md:text-sm font-bold animate-fade-in flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-base text-sky-600">⚡</span>
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage('')} className="text-sky-400 hover:text-sky-700 ml-2 cursor-pointer font-bold text-sm">✕</button>
        </div>
      )}

      {/* 전문가 수준의 고급 급식판 (Cafeteria Tray) 영역 */}
      <div className="w-full max-w-5xl mx-auto bg-gradient-to-b from-slate-200 to-slate-300 rounded-[2.5rem] p-3.5 sm:p-5 md:p-6 shadow-xl border-4 border-slate-300/90 relative flex gap-3 md:gap-5 aspect-video">
        <div className="grid grid-cols-4 grid-rows-[1fr_1.35fr] gap-3 md:gap-4 flex-1 min-h-0">
          <MenuInputSlot keyName="side1" item={menus.side1} label="반찬1" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          <MenuInputSlot keyName="side2" item={menus.side2} label="반찬2" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          <MenuInputSlot keyName="side3" item={menus.side3} label="반찬3" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          <MenuInputSlot keyName="side4" item={menus.side4} label="반찬4" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          
          <div className="col-span-2 min-h-0">
            <MenuInputSlot keyName="rice" item={menus.rice} label="🍚 밥" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          </div>
          <div className="col-span-2 min-h-0">
            <MenuInputSlot keyName="soup" item={menus.soup} label="🍲 국" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          </div>
        </div>

        {/* 우측 수저통 슬롯 */}
        <div className="w-14 sm:w-16 md:w-20 shrink-0 flex flex-col h-full py-1">
          <div className="w-full h-full rounded-[2rem] border-4 border-slate-300 bg-slate-100 flex items-center justify-center shadow-inner overflow-hidden relative">
            <img src={`${import.meta.env.BASE_URL}utensils_flat.jpg`} alt="수저 세트" className="w-full h-full object-contain opacity-70 mix-blend-multiply scale-[1.3] md:scale-[1.4] origin-center" />
          </div>
        </div>
      </div>
    </div>
  )
}
