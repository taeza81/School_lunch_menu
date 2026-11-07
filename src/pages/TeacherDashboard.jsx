import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, googleProvider, db, storage } from '../firebase'
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { 
  searchNeisSchool, 
  fetchNeisMeal, 
  REGION_TO_ATPT,
  cleanDishName,
  getNeisApiKey,
  setNeisApiKey 
} from '../utils/neisApi'
import { 
  cleanupOldMenus, 
  getExpiryTimestamp 
} from '../utils/cleanupOldMenus'

const regions = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)

  const [schoolCode, setSchoolCode] = useState(localStorage.getItem('schoolCode') || '')
  const [schoolInfo, setSchoolInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('schoolInfo')) || null
    } catch {
      return null
    }
  })
  const [isSchoolCodeSet, setIsSchoolCodeSet] = useState(!!localStorage.getItem('schoolCode'))
  const [resetMessage, setResetMessage] = useState(null)
  const [showChangeSchoolModal, setShowChangeSchoolModal] = useState(false)

  // 학교 등록/변경 모달 내부 상태
  const [schoolFormTab, setSchoolFormTab] = useState('search') // 'search' | 'manual'
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedSchool, setSelectedSchool] = useState(null)

  // 직접 입력 모드 상태
  const [manualRegion, setManualRegion] = useState('')
  const [manualSchoolName, setManualSchoolName] = useState('')

  // 나이스 오픈 API 인증키 상태
  const [neisKeyInput, setNeisKeyInput] = useState(getNeisApiKey())

  useEffect(() => {
    if (localStorage.getItem('useLocalMock') === 'true') {
      setUser({ email: 'guest@test.com (로컬 테스트 모드)' })
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser && localStorage.getItem('useLocalMock') !== 'true') {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
          if (userDoc.exists() && userDoc.data().schoolCode) {
            const code = userDoc.data().schoolCode
            const info = userDoc.data().schoolInfo || null

            setSchoolCode(code)
            setIsSchoolCodeSet(true)
            localStorage.setItem('schoolCode', code)

            if (info) {
              setSchoolInfo(info)
              localStorage.setItem('schoolInfo', JSON.stringify(info))
            } else {
              // 기존 계정 호환: schoolCode 파싱 (예: "경남_은혜학교")
              const parts = code.split('_')
              const fallbackInfo = {
                schoolCode: code,
                region: parts[0] || '',
                schoolName: parts.slice(1).join('_') || code,
                atptCode: REGION_TO_ATPT[parts[0]] || '',
                neisCode: ''
              }
              setSchoolInfo(fallbackInfo)
              localStorage.setItem('schoolInfo', JSON.stringify(fallbackInfo))
            }
            cleanupOldMenus(db, code, 45)
          } else {
            setSchoolCode('')
            setSchoolInfo(null)
            setIsSchoolCodeSet(false)
            localStorage.removeItem('schoolCode')
            localStorage.removeItem('schoolInfo')
          }
        } catch(e) { 
          console.error(e) 
        }
      } else if (!currentUser) {
        setSchoolCode('')
        setSchoolInfo(null)
        setIsSchoolCodeSet(false)
        localStorage.removeItem('schoolCode')
        localStorage.removeItem('schoolInfo')
      }
    })
    return () => unsubscribe()
  }, [])

  // [방안 C] Google 원클릭 로그인
  const handleGoogleLogin = async () => {
    setAuthLoading(true)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const currentUser = result.user
      localStorage.setItem('useLocalMock', 'false')

      // Firestore에서 유저 학교 정보 확인
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
      if (userDoc.exists() && userDoc.data().schoolCode) {
        const code = userDoc.data().schoolCode
        const info = userDoc.data().schoolInfo || null
        setSchoolCode(code)
        setIsSchoolCodeSet(true)
        localStorage.setItem('schoolCode', code)
        if (info) {
          setSchoolInfo(info)
          localStorage.setItem('schoolInfo', JSON.stringify(info))
        }
        cleanupOldMenus(db, code, 45)
      } else {
        // 처음 구글 로그인한 경우 학교 설정 화면으로 유도
        setSchoolCode('')
        setIsSchoolCodeSet(false)
      }
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        alert("Google 로그인 오류: " + error.message)
      }
    } finally {
      setAuthLoading(false)
    }
  }

  // 이메일 로그인 / 회원가입
  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        if (password !== passwordConfirm) {
          setAuthLoading(false)
          return alert("비밀번호가 일치하지 않습니다.")
        }
        if (!selectedSchool && (!manualRegion || !manualSchoolName.trim())) {
          setAuthLoading(false)
          return alert("학교 정보를 선택하거나 입력해주세요.")
        }

        // 1. 회원가입 처리
        const userCred = await createUserWithEmailAndPassword(auth, email, password)
        const newUser = userCred.user

        // 2. 학교 정보 및 코드 생성
        let code = ''
        let info = null
        if (selectedSchool) {
          code = `${selectedSchool.region}_${selectedSchool.schoolName.replace(/\s+/g, '')}`
          info = {
            schoolCode: code,
            schoolName: selectedSchool.schoolName,
            region: selectedSchool.region,
            atptCode: selectedSchool.atptCode,
            atptName: selectedSchool.atptName,
            neisCode: selectedSchool.schoolCode,
            kind: selectedSchool.kind,
            address: selectedSchool.address
          }
        } else {
          code = `${manualRegion}_${manualSchoolName.replace(/\s+/g, '')}`
          info = {
            schoolCode: code,
            schoolName: manualSchoolName.trim(),
            region: manualRegion,
            atptCode: REGION_TO_ATPT[manualRegion] || '',
            neisCode: ''
          }
        }

        await setDoc(doc(db, 'users', newUser.uid), { 
          schoolCode: code,
          schoolInfo: info
        }, { merge: true })
        
        // 3. 로컬 상태 업데이트
        localStorage.setItem('schoolCode', code)
        localStorage.setItem('schoolInfo', JSON.stringify(info))
        setSchoolCode(code)
        setSchoolInfo(info)
        setIsSchoolCodeSet(true)
      }
      localStorage.setItem('useLocalMock', 'false')
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        alert("이미 가입된 이메일입니다. 기존 계정으로 로그인해주세요.")
      } else {
        alert("인증 오류: " + error.message)
      }
    } finally {
      setAuthLoading(false)
    }
  }

  // [방안 B] 나이스 학교 검색 실행
  const handleSearchSchool = async (e) => {
    if (e) e.preventDefault()
    if (!searchKeyword.trim()) {
      setSearchError("검색할 학교 이름을 입력해 주세요.")
      return
    }
    setIsSearching(true)
    setSearchError('')
    setSelectedSchool(null)
    try {
      const results = await searchNeisSchool(searchKeyword)
      if (results.length === 0) {
        setSearchError("검색 결과가 없습니다. 학교명을 다시 확인하시거나 '직접 입력'을 이용해 주세요.")
      }
      setSearchResults(results)
    } catch (error) {
      setSearchError("학교 검색 중 오류가 발생했습니다: " + error.message)
    } finally {
      setIsSearching(false)
    }
  }

  // 학교 등록/변경 처리 공통 함수
  const submitSchoolInfo = async (schoolObj, isChange = false) => {
    let code = ''
    let info = null

    if (schoolObj.fromSearch) {
      code = `${schoolObj.region}_${schoolObj.schoolName.replace(/\s+/g, '')}`
      info = {
        schoolCode: code,
        schoolName: schoolObj.schoolName,
        region: schoolObj.region,
        atptCode: schoolObj.atptCode,
        atptName: schoolObj.atptName,
        neisCode: schoolObj.schoolCode,
        kind: schoolObj.kind,
        address: schoolObj.address
      }
    } else {
      code = `${schoolObj.region}_${schoolObj.schoolName.replace(/\s+/g, '')}`
      info = {
        schoolCode: code,
        schoolName: schoolObj.schoolName,
        region: schoolObj.region,
        atptCode: REGION_TO_ATPT[schoolObj.region] || '',
        neisCode: ''
      }
    }

    try {
      if (localStorage.getItem('useLocalMock') !== 'true' && user?.uid) {
        await setDoc(doc(db, 'users', user.uid), { 
          schoolCode: code,
          schoolInfo: info 
        }, { merge: true })
      }
      localStorage.setItem('schoolCode', code)
      localStorage.setItem('schoolInfo', JSON.stringify(info))
      setSchoolCode(code)
      setSchoolInfo(info)
      setIsSchoolCodeSet(true)

      if (isChange) {
        setShowChangeSchoolModal(false)
        alert("학교 정보가 성공적으로 변경되었습니다!")
      }
    } catch (error) {
      alert("학교 정보 저장 실패: " + error.message)
    }
  }

  const handlePasswordReset = async () => {
    if (!email) {
      setResetMessage({ type: 'error', text: '비밀번호를 재설정할 이메일 주소를\n위 이메일 칸에 입력해 주세요.' })
      return
    }
    try {
      await sendPasswordResetEmail(auth, email)
      setResetMessage({ type: 'success', text: '비밀번호 재설정 이메일이 발송되었습니다!\n메일함을 확인해 주세요.' })
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        setResetMessage({ type: 'error', text: '가입되지 않은 이메일입니다.' })
      } else if (error.code === 'auth/invalid-email') {
        setResetMessage({ type: 'error', text: '유효하지 않은 이메일 형식입니다.' })
      } else {
        setResetMessage({ type: 'error', text: '이메일 발송 오류: ' + error.message })
      }
    }
  }

  const handleGuestLogin = () => {
    localStorage.setItem('useLocalMock', 'true')
    setUser({ email: 'guest@test.com (로컬 테스트 모드)' })
    setSchoolCode('경남_은혜학교')
    const mockInfo = {
      schoolCode: '경남_은혜학교',
      schoolName: '은혜학교',
      region: '경남',
      atptCode: 'S10',
      neisCode: '9010168'
    }
    setSchoolInfo(mockInfo)
    localStorage.setItem('schoolCode', '경남_은혜학교')
    localStorage.setItem('schoolInfo', JSON.stringify(mockInfo))
    setIsSchoolCodeSet(true)
  }

  const handleLogout = async () => {
    localStorage.removeItem('useLocalMock')
    localStorage.removeItem('schoolCode')
    localStorage.removeItem('schoolInfo')
    setSchoolCode('')
    setSchoolInfo(null)
    setIsSchoolCodeSet(false)
    setUser(null)
    setEmail('')
    setPassword('')
    setPasswordConfirm('')
    
    if (localStorage.getItem('useLocalMock') !== 'true') {
      await signOut(auth)
    }
    
    navigate('/')
  }

  // 1. 비로그인 상태 화면 (로그인 / 회원가입)
  if (!user) {
    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4 relative">
        <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl w-full max-w-md">
          <div className="flex flex-col items-center justify-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full overflow-hidden shadow-md border-4 border-white shrink-0 bg-white">
              <img src={`${import.meta.env.BASE_URL}teacher_icon.jpg`} alt="선생님" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">선생님 로그인</h1>
          </div>

          {/* [방안 C] Google 원클릭 로그인 버튼 */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 text-gray-700 font-bold py-3.5 px-4 rounded-2xl transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            <span className="text-base">Google 계정으로 계속하기</span>
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="text-xs text-gray-400 font-medium">또는 이메일로 로그인</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>
          
          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <input 
              type="email" 
              placeholder="이메일 주소" 
              className="border-2 border-gray-100 bg-gray-50 p-3.5 rounded-2xl focus:outline-none focus:border-pastel-blue focus:bg-white text-base transition-all"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <input 
                type="password" 
                placeholder="비밀번호" 
                className="border-2 border-gray-100 bg-gray-50 p-3.5 rounded-2xl focus:outline-none focus:border-pastel-blue focus:bg-white text-base transition-all"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <div className="flex justify-end px-1">
                <button 
                  type="button" 
                  onClick={handlePasswordReset} 
                  className="text-xs text-gray-400 font-medium hover:text-pastel-blue transition-colors"
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>
            </div>
            
            <button 
              type="submit" 
              onClick={() => setIsLogin(true)} 
              disabled={authLoading}
              className="bg-pastel-blue text-gray-800 font-extrabold py-3.5 rounded-2xl hover:bg-blue-300 transition-all text-base mt-2 shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {authLoading ? '로그인 중...' : '이메일 로그인'}
            </button>
          </form>
          
          <div className="mt-6 pt-6 border-t-2 border-gray-50 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
              <span>아직 계정이 없으신가요?</span>
              <button 
                className="text-blue-500 font-bold hover:underline transition-colors"
                onClick={() => { 
                  setIsLogin(false)
                  setPasswordConfirm('')
                  setPassword('')
                  setEmail('')
                  setSelectedSchool(null)
                  setSearchResults([])
                  setSearchKeyword('')
                  setManualRegion('')
                  setManualSchoolName('')
                }}
              >
                회원가입
              </button>
            </div>

            <button 
              type="button"
              onClick={handleGuestLogin}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              로그인 없이 체험하기 (체험 모드)
            </button>

            <Link to="/" className="text-gray-400 text-xs font-bold hover:text-gray-600 transition-colors flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              메인으로 돌아가기
            </Link>
          </div>
        </div>

        {/* 이메일 회원가입 모달 */}
        {!isLogin && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-xl relative my-8 max-h-[90vh] overflow-y-auto">
              <button 
                onClick={() => setIsLogin(true)}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="flex flex-col items-center justify-center gap-2 mb-4 mt-2">
                <h1 className="text-2xl md:text-3xl font-extrabold text-gray-800">교사 회원가입</h1>
                <p className="text-gray-500 font-medium text-sm text-center">계정 정보와 학교 정보를 함께 입력해주세요.</p>
              </div>

              <div className="bg-blue-50 text-blue-900 p-3.5 rounded-xl text-xs font-bold mb-5 border border-blue-200">
                💡 <b>안내:</b> 소속 학교를 등록하시면 <b>우리 학교의 선생님들과 자동으로 연동</b>되어 식단 데이터를 함께 관리하고 나이스 급식을 1초 만에 불러올 수 있습니다!
              </div>

              <form onSubmit={handleAuth} className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">이메일</label>
                  <input 
                    type="email" 
                    placeholder="example@school.kr" 
                    className="border-2 border-gray-200 p-3 rounded-xl focus:outline-none focus:border-pastel-blue w-full text-base"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">비밀번호</label>
                    <input 
                      type="password" 
                      placeholder="6자리 이상" 
                      className="border-2 border-gray-200 p-3 rounded-xl focus:outline-none focus:border-pastel-blue w-full text-base"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">비밀번호 확인</label>
                    <input 
                      type="password" 
                      placeholder="비밀번호 다시 입력" 
                      className="border-2 border-gray-200 p-3 rounded-xl focus:outline-none focus:border-pastel-blue w-full text-base"
                      value={passwordConfirm}
                      onChange={e => setPasswordConfirm(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* 학교 선택 섹션 */}
                <div className="border-t border-gray-200 pt-4 mt-2">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-black text-gray-800">🏫 소속 학교 선택</span>
                    <div className="flex gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setSchoolFormTab('search')}
                        className={`px-3 py-1 rounded-lg font-bold transition-colors ${schoolFormTab === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                      >
                        나이스 검색 (추천)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchoolFormTab('manual')}
                        className={`px-3 py-1 rounded-lg font-bold transition-colors ${schoolFormTab === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                      >
                        직접 입력
                      </button>
                    </div>
                  </div>

                  {schoolFormTab === 'search' ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="학교명을 입력하세요 (예: 은혜학교)"
                          className="flex-1 border-2 border-gray-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-pastel-blue"
                          value={searchKeyword}
                          onChange={e => setSearchKeyword(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchSchool(); } }}
                        />
                        <button
                          type="button"
                          onClick={handleSearchSchool}
                          disabled={isSearching}
                          className="bg-pastel-blue hover:bg-blue-300 font-bold px-4 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap shadow-sm disabled:opacity-50"
                        >
                          {isSearching ? '검색 중...' : '검색'}
                        </button>
                      </div>

                      {searchError && (
                        <p className="text-xs text-red-500 font-medium px-1">{searchError}</p>
                      )}

                      {/* 선택된 학교 배지 */}
                      {selectedSchool && (
                        <div className="bg-green-50 border border-green-300 p-3 rounded-xl flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-green-800">선택된 학교:</span>
                            <p className="font-extrabold text-green-950 text-sm">{selectedSchool.schoolName} ({selectedSchool.region})</p>
                            <span className="text-[11px] text-green-700">{selectedSchool.atptName} · {selectedSchool.kind}</span>
                          </div>
                          <span className="text-xs bg-green-200 text-green-800 font-bold px-2 py-1 rounded-md">선택완료</span>
                        </div>
                      )}

                      {/* 검색 결과 리스트 */}
                      {searchResults.length > 0 && !selectedSchool && (
                        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50">
                          {searchResults.map((sch) => (
                            <button
                              key={sch.schoolCode}
                              type="button"
                              onClick={() => setSelectedSchool({ ...sch, fromSearch: true })}
                              className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors flex flex-col"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-gray-800 text-sm">{sch.schoolName}</span>
                                <span className="text-xs text-blue-600 font-medium">{sch.region}</span>
                              </div>
                              <span className="text-[11px] text-gray-500">{sch.atptName} | {sch.address || sch.kind}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">지역 선택</label>
                        <select 
                          className="border-2 border-gray-200 p-2.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full bg-white font-bold text-gray-700 text-sm"
                          value={manualRegion}
                          onChange={e => setManualRegion(e.target.value)}
                        >
                          <option value="">지역 선택</option>
                          {regions.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">학교명 입력</label>
                        <input 
                          type="text" 
                          placeholder="예: 은혜학교" 
                          className="border-2 border-gray-200 p-2.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-800 text-sm"
                          value={manualSchoolName}
                          onChange={e => setManualSchoolName(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  type="submit" 
                  disabled={authLoading}
                  className="bg-pastel-blue text-gray-800 font-extrabold py-3.5 rounded-xl hover:bg-blue-300 transition-colors text-base mt-2 shadow-md disabled:opacity-50"
                >
                  {authLoading ? '회원가입 처리 중...' : '회원가입 완료'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 비밀번호 재설정 알림 모달 */}
        {resetMessage && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] overflow-y-auto">
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center relative animate-fade-in-up">
              <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 ${resetMessage.type === 'success' ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
                {resetMessage.type === 'success' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-gray-800 mb-2">{resetMessage.type === 'success' ? '메일 발송 완료' : '안내'}</h3>
              <p className="text-gray-600 text-sm font-medium mb-6 whitespace-pre-line leading-relaxed">{resetMessage.text}</p>
              <button 
                onClick={() => setResetMessage(null)}
                className="w-full bg-pastel-blue text-gray-800 font-extrabold py-3 rounded-xl hover:bg-blue-300 transition-all text-base shadow-md"
              >
                확인
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 2. 로그인되었으나 학교 등록이 안 된 상태 화면
  if (user && !isSchoolCodeSet) {
    const handleSaveSchool = (e) => {
      e.preventDefault()
      if (selectedSchool) {
        submitSchoolInfo({ ...selectedSchool, fromSearch: true })
      } else {
        if (!manualRegion || !manualSchoolName.trim()) {
          return alert("지역과 학교명을 모두 입력해주세요.")
        }
        submitSchoolInfo({ region: manualRegion, schoolName: manualSchoolName.trim(), fromSearch: false })
      }
    }

    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl w-full max-w-xl text-center border-t-8 border-pastel-yellow">
          <h2 className="text-3xl font-extrabold mb-3 text-gray-800">🏫 우리 학교 등록하기</h2>
          <p className="text-gray-600 text-sm mb-4">선생님 환영합니다! 식단 공유와 나이스 급식 연동을 위해 소속 학교를 등록해 주세요.</p>
          
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setSchoolFormTab('search')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${schoolFormTab === 'search' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}
            >
              나이스 학교 검색 (추천)
            </button>
            <button
              type="button"
              onClick={() => setSchoolFormTab('manual')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${schoolFormTab === 'manual' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}
            >
              직접 입력
            </button>
          </div>

          <form onSubmit={handleSaveSchool} className="flex flex-col gap-4 text-left">
            {schoolFormTab === 'search' ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="학교명을 입력하세요 (예: 은혜학교)"
                    className="flex-1 border-2 border-gray-200 p-3 rounded-xl text-base focus:outline-none focus:border-pastel-blue"
                    value={searchKeyword}
                    onChange={e => setSearchKeyword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchSchool(); } }}
                  />
                  <button
                    type="button"
                    onClick={handleSearchSchool}
                    disabled={isSearching}
                    className="bg-pastel-blue hover:bg-blue-300 font-bold px-5 py-3 rounded-xl text-base transition-colors whitespace-nowrap shadow-sm disabled:opacity-50"
                  >
                    {isSearching ? '검색 중...' : '검색'}
                  </button>
                </div>

                {searchError && (
                  <p className="text-xs text-red-500 font-medium px-1">{searchError}</p>
                )}

                {selectedSchool && (
                  <div className="bg-green-50 border border-green-300 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-green-800">선택된 학교:</span>
                      <p className="font-extrabold text-green-950 text-base">{selectedSchool.schoolName} ({selectedSchool.region})</p>
                      <span className="text-xs text-green-700">{selectedSchool.atptName} · {selectedSchool.kind}</span>
                    </div>
                    <span className="text-xs bg-green-200 text-green-800 font-bold px-3 py-1.5 rounded-lg">선택됨</span>
                  </div>
                )}

                {searchResults.length > 0 && !selectedSchool && (
                  <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50">
                    {searchResults.map((sch) => (
                      <button
                        key={sch.schoolCode}
                        type="button"
                        onClick={() => setSelectedSchool({ ...sch, fromSearch: true })}
                        className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex flex-col"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-800 text-base">{sch.schoolName}</span>
                          <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">{sch.region}</span>
                        </div>
                        <span className="text-xs text-gray-500 mt-0.5">{sch.atptName} | {sch.address || sch.kind}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">지역 선택</label>
                  <select 
                    className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-700 text-base bg-white"
                    value={manualRegion}
                    onChange={e => setManualRegion(e.target.value)}
                    required
                  >
                    <option value="" disabled>지역을 선택해주세요</option>
                    {regions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">학교명 입력</label>
                  <input 
                    type="text" 
                    placeholder="학교명을 입력해 주세요." 
                    className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-800 text-base"
                    value={manualSchoolName}
                    onChange={e => setManualSchoolName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <button 
              type="submit" 
              className="bg-pastel-yellow text-gray-800 font-extrabold py-4 rounded-xl hover:bg-yellow-400 transition-colors text-lg mt-2 shadow-md text-center"
            >
              학교 등록 완료 및 시작하기
            </button>
          </form>

          <div className="mt-6 flex justify-center">
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 font-bold">
              다른 계정으로 로그인하기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 3. 메인 대시보드 화면
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* 상단 네비게이션 헤더 */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden shadow-sm border-2 border-white shrink-0 bg-white">
              <img src={`${import.meta.env.BASE_URL}teacher_icon.jpg`} alt="선생님" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-gray-800">선생님 관리자 페이지</h1>
                {schoolInfo?.neisCode && (
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span>✨</span> 나이스 연동됨
                  </span>
                )}
              </div>
              <p className="text-xs md:text-sm text-gray-500 font-bold mt-0.5">
                🏫 우리 학교: <span className="text-blue-600">{schoolInfo?.schoolName || schoolCode}</span>
                {schoolInfo?.region && <span className="text-gray-400 font-normal"> ({schoolInfo.region})</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
            <span className="text-xs text-gray-500 font-medium hidden lg:inline">{user.email}</span>
            <button 
              onClick={() => {
                setShowChangeSchoolModal(true)
                setSelectedSchool(null)
                setSearchResults([])
                setSearchKeyword('')
                setManualRegion(schoolInfo?.region || '')
                setManualSchoolName(schoolInfo?.schoolName || '')
                setNeisKeyInput(getNeisApiKey())
              }} 
              className="bg-gray-100 text-gray-700 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold hover:bg-gray-200 transition-colors shadow-sm"
            >
              학교 변경
            </button>
            <button 
              onClick={handleLogout} 
              className="bg-red-50 text-red-600 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold hover:bg-red-100 transition-colors shadow-sm"
            >
              로그아웃
            </button>
            <Link 
              to="/" 
              className="bg-white border-2 border-pastel-blue text-blue-700 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              메인으로
            </Link>
          </div>
        </div>

        {/* [방안 A] 용량 자동 관리 안내 배너 */}
        <div className="mb-6 bg-gradient-to-r from-blue-50 via-green-50 to-emerald-50 border border-green-200 text-emerald-900 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-base">🛡️</span>
            <span><b>용량 안심 관리 중:</b> Firebase 무료 1GB 영구 유지를 위해 45일 이전 식단은 자동 정리되며, 이미지는 고효율로 압축 저장됩니다. (최근 45일 식단 및 학교 정보 안전 보존)</span>
          </div>
          <span className="text-[11px] bg-white/80 px-2 py-0.5 rounded-full border border-emerald-300 text-emerald-800 hidden sm:inline">Spark 100% 무료</span>
        </div>
        
        {/* 메뉴 편집기 */}
        <MenuEditor 
          schoolCode={schoolCode} 
          schoolInfo={schoolInfo}
          onUpdateSchoolInfo={(newInfo) => {
            setSchoolInfo(newInfo)
            localStorage.setItem('schoolInfo', JSON.stringify(newInfo))
          }}
        />

        {/* 학교 정보 변경 모달 */}
        {showChangeSchoolModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">학교 정보 변경</h2>
              
              <div className="flex items-center justify-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setSchoolFormTab('search')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${schoolFormTab === 'search' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'}`}
                >
                  나이스 검색 (추천)
                </button>
                <button
                  type="button"
                  onClick={() => setSchoolFormTab('manual')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${schoolFormTab === 'manual' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'}`}
                >
                  직접 입력
                </button>
              </div>

              {schoolFormTab === 'search' ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="학교명 입력 (예: 은혜학교)"
                      className="flex-1 border-2 border-gray-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-pastel-blue"
                      value={searchKeyword}
                      onChange={e => setSearchKeyword(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchSchool(); } }}
                    />
                    <button
                      type="button"
                      onClick={handleSearchSchool}
                      disabled={isSearching}
                      className="bg-pastel-blue hover:bg-blue-300 font-bold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
                    >
                      {isSearching ? '검색 중' : '검색'}
                    </button>
                  </div>

                  {searchError && (
                    <p className="text-xs text-red-500 font-medium">{searchError}</p>
                  )}

                  {selectedSchool && (
                    <div className="bg-green-50 border border-green-300 p-3 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-green-800">선택된 학교:</span>
                        <p className="font-extrabold text-green-950 text-sm">{selectedSchool.schoolName} ({selectedSchool.region})</p>
                        <span className="text-[11px] text-green-700">{selectedSchool.atptName}</span>
                      </div>
                      <span className="text-xs bg-green-200 text-green-800 font-bold px-2 py-1 rounded">선택됨</span>
                    </div>
                  )}

                  {searchResults.length > 0 && !selectedSchool && (
                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50">
                      {searchResults.map((sch) => (
                        <button
                          key={sch.schoolCode}
                          type="button"
                          onClick={() => setSelectedSchool({ ...sch, fromSearch: true })}
                          className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors flex flex-col"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-800 text-sm">{sch.schoolName}</span>
                            <span className="text-xs text-blue-600 font-bold">{sch.region}</span>
                          </div>
                          <span className="text-[11px] text-gray-500">{sch.atptName} | {sch.address || sch.kind}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <select 
                    value={manualRegion} 
                    onChange={(e) => setManualRegion(e.target.value)}
                    className="border-2 border-gray-200 p-3 rounded-xl text-sm font-bold text-gray-700 bg-white"
                  >
                    <option value="">지역 선택</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input 
                    type="text" 
                    placeholder="새로운 학교명 (예: 은혜학교)" 
                    className="border-2 border-gray-200 p-3 rounded-xl text-sm font-bold text-gray-800"
                    value={manualSchoolName}
                    onChange={(e) => setManualSchoolName(e.target.value)}
                  />
                </div>
              )}

              {/* 나이스 오픈 API 인증키 설정 (선택 사항) */}
              <div className="border-t border-gray-100 pt-3 mt-3">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  🔑 나이스 오픈 API 인증키 (선택 사항)
                </label>
                <input 
                  type="text" 
                  placeholder="미입력 시 1일 1,000건 기본 무료 호출" 
                  className="border border-gray-200 p-2.5 rounded-xl text-xs w-full font-mono text-gray-700 bg-gray-50 focus:bg-white focus:outline-none focus:border-pastel-blue"
                  value={neisKeyInput}
                  onChange={(e) => setNeisKeyInput(e.target.value)}
                />
                <p className="text-[11px] text-gray-400 mt-1 leading-normal">
                  💡 인증키가 없어도 하루 1,000건까지 기본 무료로 자동 작동합니다. 정식 발급키가 있으실 때만 입력해 주세요.
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setShowChangeSchoolModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors text-sm"
                >
                  취소
                </button>
                <button 
                  onClick={() => {
                    setNeisApiKey(neisKeyInput)
                    if (selectedSchool) {
                      submitSchoolInfo({ ...selectedSchool, fromSearch: true }, true)
                    } else if (manualRegion && manualSchoolName.trim()) {
                      submitSchoolInfo({ region: manualRegion, schoolName: manualSchoolName.trim(), fromSearch: false }, true)
                    } else {
                      // 학교 정보 변경 없이 API 키만 변경한 경우
                      setShowChangeSchoolModal(false)
                      alert("설정이 저장되었습니다!")
                    }
                  }}
                  className="flex-1 bg-pastel-blue text-gray-800 py-3 rounded-xl font-bold hover:bg-blue-300 transition-colors shadow-md text-sm"
                >
                  저장하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 개별 식판 메뉴 슬롯 컴포넌트
 */
const MenuInputSlot = ({ keyName, item, label, handleMenuChange, handleImageUpload }) => (
  <div className="bg-white rounded-3xl p-3 md:p-4 shadow-sm border-[3px] border-gray-100 flex flex-col gap-2 transition-all duration-300 hover:border-blue-400 hover:ring-4 hover:ring-blue-400/30 hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] h-full min-h-0 group cursor-pointer">
    <div className="flex justify-center">
      <span className="bg-blue-50 text-blue-800 border border-blue-200 font-extrabold px-5 py-1.5 rounded-full text-sm shadow-sm tracking-wide">
        {label}
      </span>
    </div>
    
    {item.imageUrl ? (
      <div className="relative w-full flex-1 min-h-0 bg-gray-50 rounded-2xl overflow-hidden group border-2 border-gray-200">
        <img src={item.imageUrl} alt={item.name} className="object-contain w-full h-full p-2" />
        <button 
          onClick={() => handleMenuChange(keyName, 'imageUrl', '')}
          className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full text-red-500 hover:bg-white hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-gray-100"
          title="이미지 삭제"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    ) : (
      <div className="w-full flex-1 min-h-0 border-2 border-dashed border-gray-300 bg-gray-50 rounded-2xl flex flex-col items-center justify-center p-3 relative hover:border-blue-400 hover:bg-blue-50/30 transition-colors group">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400 mb-2 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-xs text-gray-500 font-medium mb-2 pointer-events-none text-center group-hover:text-blue-600 transition-colors">클릭하여 사진 업로드<br/>(또는 URL 입력)</span>
        <input 
          type="file" 
          accept="image/*"
          onChange={(e) => handleImageUpload(keyName, e.target.files[0])}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
        <input 
          type="text" 
          placeholder="웹 이미지 URL" 
          value={item.imageUrl}
          onChange={(e) => handleMenuChange(keyName, 'imageUrl', e.target.value)}
          className="border border-gray-200 p-1.5 rounded-lg text-xs w-full text-center relative z-10 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white shadow-sm"
        />
      </div>
    )}

    <div className="relative mt-1">
      <input 
        type="text" 
        placeholder="✏️ 메뉴 입력" 
        value={item.name}
        onChange={(e) => handleMenuChange(keyName, 'name', e.target.value)}
        className="border-2 border-gray-300 bg-white p-2 md:p-2.5 rounded-xl w-full text-center font-extrabold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm text-sm md:text-base"
      />
    </div>
  </div>
)

/**
 * 급식 메뉴 편집기 컴포넌트
 */
function MenuEditor({ schoolCode, schoolInfo, onUpdateSchoolInfo }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
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
  const [toastMessage, setToastMessage] = useState(null)

  const showToast = (text, type = 'info') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  const handleMenuChange = (key, field, value) => {
    setMenus(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }))
  }

  // [방안 A] 고효율 이미지 압축 (480px, 0.55 품질) - Firestore 문서 크기 절반 이하로 감소
  const handleImageUpload = async (key, file) => {
    if (!file) return;

    const compressImage = (imageFile) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 480; // 600 -> 480으로 최적화하여 Base64 용량 대폭 절감
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_SIZE) {
                height *= MAX_SIZE / width;
                width = MAX_SIZE;
              }
            } else {
              if (height > MAX_SIZE) {
                width *= MAX_SIZE / height;
                height = MAX_SIZE;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            // 0.55 품질로 압축 (식판 카드용으로 화질 충분하며 용량은 최소화)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.55);
            resolve(dataUrl);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(imageFile);
      });
    };

    try {
      const compressedDataUrl = await compressImage(file);
      handleMenuChange(key, 'imageUrl', compressedDataUrl);
    } catch (error) {
      alert("이미지 처리 실패: " + error.message)
    }
  }

  const fetchMenu = async () => {
    const isMock = localStorage.getItem('useLocalMock') === 'true'
    try {
      if (isMock) {
        const localData = localStorage.getItem(`menus_${schoolCode}_${date}`)
        if (localData) {
          setMenus(JSON.parse(localData))
          return
        }
      } else {
        const docRef = doc(db, 'schools', schoolCode, 'menus', date)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          setMenus(docSnap.data().menus)
          return
        }
      }
    } catch (error) {
      console.error(error)
      const localData = localStorage.getItem(`menus_${schoolCode}_${date}`)
      if (localData) {
        setMenus(JSON.parse(localData))
        return
      }
    }
    
    // 데이터가 없으면 초기화
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

  // [방안 B] 나이스(NEIS) 오늘의 급식 식단 자동 불러오기
  const handleFetchNeis = async () => {
    setLoadingNeis(true)
    try {
      let atpt = schoolInfo?.atptCode
      let neis = schoolInfo?.neisCode

      // 만약 기존 사용자라 나이스 코드가 비어있다면, 현재 학교명/지역으로 자동 검색 연동
      if (!neis || !atpt) {
        const schoolName = schoolInfo?.schoolName || schoolCode.split('_')[1] || ''
        const region = schoolInfo?.region || schoolCode.split('_')[0] || ''
        
        if (schoolName) {
          const results = await searchNeisSchool(schoolName, region)
          if (results.length > 0) {
            const matched = results[0]
            atpt = matched.atptCode
            neis = matched.schoolCode
            const updatedInfo = {
              ...(schoolInfo || {}),
              schoolCode,
              schoolName: matched.schoolName,
              region: matched.region,
              atptCode: matched.atptCode,
              neisCode: matched.schoolCode
            }
            if (onUpdateSchoolInfo) onUpdateSchoolInfo(updatedInfo)
            if (localStorage.getItem('useLocalMock') !== 'true' && auth.currentUser) {
              await setDoc(doc(db, 'users', auth.currentUser.uid), { schoolInfo: updatedInfo }, { merge: true })
            }
          }
        }
      }

      if (!atpt || !neis) {
        showToast("⚠️ 소속 학교의 나이스 코드를 찾을 수 없습니다. 상단 [학교 변경]에서 '나이스 학교 검색'으로 학교를 다시 선택해 주세요.", 'warning')
        setLoadingNeis(false)
        return
      }

      const res = await fetchNeisMeal(atpt, neis, date)
      if (!res.success) {
        showToast(res.message || "나이스 급식 정보를 찾을 수 없습니다.", 'warning')
        setLoadingNeis(false)
        return
      }

      // 기존 사진(imageUrl)은 보존하고 메뉴 이름만 쏙 업데이트!
      const p = res.parsedMenus
      setMenus(prev => ({
        rice: { ...prev.rice, name: p.rice || prev.rice.name },
        soup: { ...prev.soup, name: p.soup || prev.soup.name },
        side1: { ...prev.side1, name: p.side1 || prev.side1.name },
        side2: { ...prev.side2, name: p.side2 || prev.side2.name },
        side3: { ...prev.side3, name: p.side3 || prev.side3.name },
        side4: { ...prev.side4, name: p.side4 || prev.side4.name },
      }))

      showToast(`🍱 [${res.mealType}] 메뉴 ${res.rawList.length}개를 나이스에서 불러왔습니다!`, 'success')
    } catch (error) {
      showToast("나이스 급식 연동 실패: " + error.message, 'error')
    } finally {
      setLoadingNeis(false)
    }
  }

  // [방안 A] 메뉴 저장 시 TTL 필드(expireAt) 포함 및 백그라운드 클린업 실행
  const saveMenu = async () => {
    setSaving(true)
    const isMock = localStorage.getItem('useLocalMock') === 'true'
    try {
      if (isMock) {
        localStorage.setItem(`menus_${schoolCode}_${date}`, JSON.stringify(menus))
        showToast("로컬 저장소에 저장되었습니다! (체험 모드)", 'success')
      } else {
        // expireAt: 60일 뒤 타임스탬프 (Firebase Console TTL 정책 지원)
        const payload = {
          menus,
          savedAt: new Date().toISOString(),
          expireAt: getExpiryTimestamp(60)
        }
        await setDoc(doc(db, 'schools', schoolCode, 'menus', date), payload)
        showToast("✅ 급식 메뉴가 저장되었습니다! (45일 이전 식단은 무료 용량 유지를 위해 자동 정리)", 'success')

        // 백그라운드에서 45일 이전 지난 식단 자동 정리 (용량 1GB 영구 세이프)
        cleanupOldMenus(db, schoolCode, 45)
      }
    } catch (error) {
      showToast("Firebase 연동 실패. 로컬에 임시 저장합니다: " + error.message, 'error')
      localStorage.setItem(`menus_${schoolCode}_${date}`, JSON.stringify(menus))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-[2rem] shadow-xl p-5 md:p-8 border border-gray-100 relative">
      {/* 토스트 알림 메시지 */}
      {toastMessage && (
        <div className={`mb-4 p-3.5 rounded-2xl text-sm font-bold flex items-center justify-between shadow-sm animate-fade-in ${
          toastMessage.type === 'success' ? 'bg-green-100 text-green-900 border border-green-300' :
          toastMessage.type === 'warning' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
          'bg-red-100 text-red-900 border border-red-300'
        }`}>
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="text-xs opacity-70 hover:opacity-100 ml-2">닫기</button>
        </div>
      )}

      {/* 조작 툴바: 날짜 선택, 나이스 급식 불러오기, 저장하기 */}
      <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="font-bold text-gray-700 whitespace-nowrap text-sm md:text-base">날짜 선택:</label>
          <input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 p-2 md:p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pastel-blue font-bold text-gray-700 w-full md:w-auto shadow-sm bg-white text-sm md:text-base"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* [방안 B] 나이스 급식 가져오기 버튼 */}
          <button
            type="button"
            onClick={handleFetchNeis}
            disabled={loadingNeis}
            className="flex-1 md:flex-initial bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold py-2.5 px-4 md:px-5 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5 text-xs md:text-sm whitespace-nowrap"
            title="교육부 나이스에서 오늘의 급식 식단명을 자동으로 불러옵니다"
          >
            <span>✨</span>
            <span>{loadingNeis ? '나이스 조회 중...' : '나이스 급식 불러오기'}</span>
          </button>
          
          {/* 급식 저장하기 버튼 */}
          <button 
            onClick={saveMenu} 
            disabled={saving}
            className="flex-1 md:flex-initial bg-pastel-blue text-gray-900 font-black py-2.5 px-5 md:px-6 rounded-xl hover:bg-blue-300 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5 text-xs md:text-sm whitespace-nowrap"
          >
            <span>💾</span>
            <span>{saving ? '저장 중...' : '급식 저장하기'}</span>
          </button>
        </div>
      </div>

      {/* 식판 레이아웃 */}
      <div className="w-full max-w-5xl mx-auto bg-gray-200 rounded-[2.5rem] p-3 md:p-6 shadow-inner relative flex gap-3 md:gap-6 aspect-video">
        <div className="grid grid-cols-4 grid-rows-[1fr_1.4fr] gap-3 md:gap-6 flex-1 min-h-0">
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

        <div className="w-14 md:w-24 shrink-0 flex flex-col h-full py-2">
          <div className="w-full h-full rounded-[2.5rem] border-[4px] md:border-[6px] border-gray-300 bg-gray-100 flex items-center justify-center shadow-inner overflow-hidden relative">
            <img src={`${import.meta.env.BASE_URL}utensils_flat.jpg`} alt="수저 세트" className="w-full h-full object-contain opacity-70 mix-blend-multiply scale-[1.4] md:scale-[1.5] origin-center" />
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-xs text-gray-400 font-medium">
        💡 <b>팁:</b> [나이스 급식 불러오기]를 누르면 메뉴 이름이 자동으로 입력되며, 사진만 찍어서 추가하시면 간편하게 완성됩니다!
      </div>
    </div>
  )
}
