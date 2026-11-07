import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db, signInWithGoogle, logoutUser } from '../firebase'
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { compressImage } from '../utils/imageCompressor'
import { searchNeisSchools, fetchNeisMealMenu, resolveNeisSchoolFromLegacyCode } from '../utils/neisApi'
import { cleanupOldMenus } from '../utils/cleanupOldMenus'

const regions = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isLogin, setIsLogin] = useState(true)

  const [schoolCode, setSchoolCode] = useState(localStorage.getItem('schoolCode') || '')
  const [isSchoolCodeSet, setIsSchoolCodeSet] = useState(!!localStorage.getItem('schoolCode'))
  const [region, setRegion] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [resetMessage, setResetMessage] = useState(null)
  
  // 학교 검색 모달 및 상태
  const [showSchoolSearchModal, setShowSchoolSearchModal] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchRegionFilter, setSearchRegionFilter] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [cleanupStatus, setCleanupStatus] = useState(null)

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
            const code = data.schoolCode;
            setSchoolCode(code)
            setIsSchoolCodeSet(true)
            localStorage.setItem('schoolCode', code)
            if (data.neisOfficeCode) localStorage.setItem(`neis_office_${code}`, data.neisOfficeCode)
            if (data.neisSchoolCode) localStorage.setItem(`neis_school_${code}`, data.neisSchoolCode)
            if (data.schoolName) localStorage.setItem(`neis_name_${code}`, data.schoolName)
            if (data.region) localStorage.setItem(`neis_region_${code}`, data.region)
          } else {
            // Firestore에 코드가 없다면 로컬 코드 초기화 및 등록 유도
            setSchoolCode('')
            setIsSchoolCodeSet(false)
            localStorage.removeItem('schoolCode')
          }
        } catch(e) { 
          console.error(e) 
        }
      } else if (!currentUser) {
        setSchoolCode('')
        setIsSchoolCodeSet(false)
        localStorage.removeItem('schoolCode')
      }
    })
    return () => unsubscribe()
  }, [])

  // [방안 A] 용량 자동 안심 관리: 30일 이전(약 한달 전) 식단 백그라운드 자동 정리
  useEffect(() => {
    if (schoolCode) {
      cleanupOldMenus(schoolCode, 30).then((result) => {
        if (result && result.success) {
          if (result.deletedCount > 0) {
            setCleanupStatus(`🛡️ 30일 이전 데이터 ${result.deletedCount}건이 자동 정리되어 1GB 저장소가 안전하게 유지됩니다.`)
          }
        }
      })
    }
  }, [schoolCode])

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
        // 처음 로그인한 구글 계정인 경우 학교 등록 화면으로 안내
        setSchoolCode('')
        setIsSchoolCodeSet(false)
        setShowSchoolSearchModal(true)
      }
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user') return
      alert("Google 로그인 오류: " + error.message)
    }
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        if (password !== passwordConfirm) {
          return alert("비밀번호가 일치하지 않습니다.")
        }
        if (!region || !schoolName.trim()) {
          return alert("지역과 학교명을 모두 입력하거나 [전국 학교 검색]을 이용해주세요.")
        }

        // 1. 회원가입 처리
        const userCred = await createUserWithEmailAndPassword(auth, email, password)
        const newUser = userCred.user

        // 2. 학교 코드 생성 및 저장
        const code = `${region}_${schoolName.replace(/\s+/g, '')}`
        await setDoc(doc(db, 'users', newUser.uid), { 
          schoolCode: code,
          region,
          schoolName: schoolName.trim()
        }, { merge: true })
        
        // 3. 로컬 상태 업데이트
        localStorage.setItem('schoolCode', code)
        setSchoolCode(code)
        setIsSchoolCodeSet(true)
      }
      localStorage.setItem('useLocalMock', 'false')
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        alert("이미 가입된 이메일입니다. 기존 계정으로 로그인해주세요.")
      } else {
        alert("인증 오류: " + error.message)
      }
    }
  }

  // NEIS 전국 학교 검색 실행
  const handleSearchNeis = async (e) => {
    if (e) e.preventDefault()
    if (!searchKeyword.trim()) {
      return alert("검색할 학교 이름을 2글자 이상 입력해주세요.")
    }
    setIsSearching(true)
    try {
      const list = await searchNeisSchools(searchKeyword.trim(), searchRegionFilter)
      setSearchResults(list)
      if (list.length === 0) {
        alert("검색 결과가 없습니다. 학교명을 다시 확인해 주세요.")
      }
    } catch (err) {
      alert("나이스 학교 검색 실패: " + err.message)
    } finally {
      setIsSearching(false)
    }
  }

  // 검색된 NEIS 학교 선택 적용
  const handleSelectNeisSchool = async (selected) => {
    const code = `${selected.region}_${selected.schoolName.replace(/\s+/g, '')}`
    
    // 캐시 및 로컬스토리지 저장
    localStorage.setItem('schoolCode', code)
    localStorage.setItem(`neis_office_${code}`, selected.officeCode)
    localStorage.setItem(`neis_school_${code}`, selected.schoolCode)
    localStorage.setItem(`neis_name_${code}`, selected.schoolName)
    localStorage.setItem(`neis_region_${code}`, selected.region)
    localStorage.setItem('neisOfficeCode', selected.officeCode)
    localStorage.setItem('neisSchoolCode', selected.schoolCode)

    setSchoolCode(code)
    setRegion(selected.region)
    setSchoolName(selected.schoolName)
    setIsSchoolCodeSet(true)

    // Firebase 유저 정보 저장
    if (user && user.uid && localStorage.getItem('useLocalMock') !== 'true') {
      try {
        await setDoc(doc(db, 'users', user.uid), { 
          schoolCode: code,
          neisOfficeCode: selected.officeCode,
          neisSchoolCode: selected.schoolCode,
          schoolName: selected.schoolName,
          region: selected.region,
          schoolKind: selected.schoolKind
        }, { merge: true })
      } catch (err) {
        console.warn("사용자 정보 저장 경고:", err)
      }
    }

    setShowSchoolSearchModal(false)
    alert(`🎉 [${selected.schoolName}](${selected.region})이(가) 등록되었습니다!`)
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

  const handleLogout = async () => {
    localStorage.removeItem('useLocalMock')
    localStorage.removeItem('schoolCode')
    setSchoolCode('')
    setIsSchoolCodeSet(false)
    setUser(null)
    setEmail('')
    setPassword('')
    setPasswordConfirm('')
    
    if (localStorage.getItem('useLocalMock') !== 'true') {
      await logoutUser()
    }
    
    navigate('/')
  }

  // 1. 미로그인 상태 화면 (Google 원클릭 로그인 + 이메일 로그인)
  if (!user) {
    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4 relative">
        <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl w-full max-w-md">
          <div className="flex flex-col items-center justify-center gap-3 mb-6">
            <div className="w-16 h-16 rounded-full overflow-hidden shadow-md border-4 border-white shrink-0 bg-white">
              <img src={`${import.meta.env.BASE_URL}teacher_icon.jpg`} alt="선생님" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">교사 로그인</h1>
            <p className="text-sm text-gray-500 font-medium">원클릭 간편 로그인으로 편리하게 시작하세요</p>
          </div>

          {/* Google 원클릭 간편 로그인 버튼 */}
          <button 
            type="button" 
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] text-gray-700 font-bold py-3.5 px-4 rounded-2xl shadow-sm hover:shadow transition-all text-base mb-4 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Google 계정으로 원클릭 로그인</span>
          </button>

          <div className="relative flex py-2 items-center mb-4">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-4 text-xs font-bold text-gray-400">또는 이메일로 로그인</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>
          
          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
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
                    className="text-xs text-gray-400 font-medium hover:text-pastel-blue transition-colors cursor-pointer"
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                </div>
              </div>
            </div>
            
            <button type="submit" onClick={() => setIsLogin(true)} className="bg-pastel-blue text-gray-800 font-extrabold py-3.5 rounded-2xl hover:bg-blue-300 transition-all text-base mt-1 shadow-md hover:shadow-lg cursor-pointer">
              이메일로 로그인
            </button>
          </form>
          
          <div className="mt-6 pt-6 border-t-2 border-gray-50 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-gray-500 font-medium text-sm">
              <span>아직 계정이 없으신가요?</span>
              <button 
                className="text-pastel-blue font-bold hover:text-blue-500 transition-colors cursor-pointer"
                onClick={() => { setIsLogin(false); setPasswordConfirm(''); setPassword(''); setEmail(''); setRegion(''); setSchoolName(''); }}
              >
                회원가입
              </button>
            </div>
            <Link to="/" className="text-gray-400 text-sm font-bold hover:text-gray-600 transition-colors flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              메인으로 돌아가기
            </Link>
          </div>
        </div>

        {/* 회원가입 모달 */}
        {!isLogin && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-xl relative my-8">
              <button 
                onClick={() => setIsLogin(true)}
                className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="flex flex-col items-center justify-center gap-2 mb-5">
                <h1 className="text-2xl md:text-3xl font-extrabold text-gray-800">교사 회원가입</h1>
                <p className="text-gray-500 font-medium text-center text-sm">소속 학교를 등록하면 나이스 급식 API가 자동 연동됩니다.</p>
              </div>

              <div className="bg-blue-50 text-blue-900 p-3.5 rounded-xl text-xs md:text-sm font-bold text-center mb-5 break-keep leading-relaxed border border-blue-200">
                💡 <b>전국 학교 검색 지원:</b> 아래 [전국 학교 검색]을 누르시면 교육부 나이스 DB에서 정확한 학교를 1초 만에 찾을 수 있습니다.
              </div>

              <form onSubmit={handleAuth} className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 ml-1">이메일</label>
                  <input 
                    type="email" 
                    placeholder="teacher@school.kr" 
                    className="border-2 border-gray-200 p-3 rounded-xl focus:outline-none focus:border-pastel-blue w-full text-base"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                      placeholder="다시 입력" 
                      className="border-2 border-gray-200 p-3 rounded-xl focus:outline-none focus:border-pastel-blue w-full text-base"
                      value={passwordConfirm}
                      onChange={e => setPasswordConfirm(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-gray-700 ml-1">소속 학교 정보</label>
                    <button 
                      type="button"
                      onClick={() => setShowSchoolSearchModal(true)}
                      className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      🔍 전국 학교 검색
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <select 
                        className="border-2 border-gray-200 p-3 rounded-xl focus:outline-none focus:border-pastel-blue w-full bg-white font-bold text-gray-700 text-base"
                        value={region}
                        onChange={e => setRegion(e.target.value)}
                        required
                      >
                        <option value="" disabled>지역</option>
                        {regions.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input 
                        type="text" 
                        placeholder="예: 김해은혜학교" 
                        className="border-2 border-gray-200 p-3 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-800 text-base"
                        value={schoolName}
                        onChange={e => setSchoolName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" onClick={() => setIsLogin(false)} className="bg-pastel-blue text-gray-800 font-extrabold py-3.5 rounded-xl hover:bg-blue-300 transition-colors text-base mt-3 shadow-md cursor-pointer">
                  학교 정보 확인 및 회원가입 완료
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 비밀번호 재설정 모달 */}
        {resetMessage && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] overflow-y-auto">
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center relative">
              <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 ${resetMessage.type === 'success' ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
                {resetMessage.type === 'success' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-gray-800 mb-2">{resetMessage.type === 'success' ? '메일 발송 완료' : '안내'}</h3>
              <p className="text-gray-600 font-medium mb-6 whitespace-pre-line text-sm leading-relaxed">{resetMessage.text}</p>
              <button 
                onClick={() => setResetMessage(null)}
                className="w-full bg-pastel-blue text-gray-800 font-extrabold py-3 rounded-xl hover:bg-blue-300 transition-all text-base shadow-md cursor-pointer"
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* 전국 학교 검색 모달 */}
        {showSchoolSearchModal && (
          <SchoolSearchModal
            searchKeyword={searchKeyword}
            setSearchKeyword={setSearchKeyword}
            searchRegionFilter={searchRegionFilter}
            setSearchRegionFilter={setSearchRegionFilter}
            searchResults={searchResults}
            isSearching={isSearching}
            onSearch={handleSearchNeis}
            onSelect={handleSelectNeisSchool}
            onClose={() => setShowSchoolSearchModal(false)}
          />
        )}
      </div>
    )
  }

  // 2. 로그인 후 학교 코드가 미설정된 상태 (Google 신규 가입자 등)
  if (user && !isSchoolCodeSet) {
    const handleSetSchoolCode = async (e) => {
      e.preventDefault()
      if (!region || !schoolName.trim()) return alert("지역과 학교명을 모두 입력해주세요.");
      const code = `${region}_${schoolName.replace(/\s+/g, '')}`
      
      try {
        if (localStorage.getItem('useLocalMock') !== 'true') {
          await setDoc(doc(db, 'users', user.uid), { 
            schoolCode: code,
            region,
            schoolName: schoolName.trim()
          }, { merge: true })
        }
        localStorage.setItem('schoolCode', code)
        setSchoolCode(code)
        setIsSchoolCodeSet(true)
      } catch (error) {
        alert("코드 저장 실패: " + error.message)
      }
    }

    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl w-full max-w-xl text-center border-t-8 border-pastel-yellow">
          <h2 className="text-3xl font-extrabold mb-3 text-gray-800">🏫 우리 학교 등록하기</h2>
          <div className="bg-blue-50 text-blue-900 p-4 rounded-xl text-sm font-bold text-center mb-6 break-keep leading-relaxed border border-blue-200">
            💡 <b>전국 학교 검색:</b> 아래 검색 버튼을 누르시면 교육부 NEIS 공공 데이터와 연동되어 당일 식단 1초 불러오기를 바로 이용하실 수 있습니다!
          </div>

          <button 
            type="button" 
            onClick={() => setShowSchoolSearchModal(true)}
            className="w-full mb-6 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-md transition-all text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>🔍 교육부 나이스(NEIS) 전국 학교 검색하기</span>
          </button>

          <div className="relative flex py-2 items-center mb-6">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-4 text-xs font-bold text-gray-400">또는 직접 입력하기</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <form onSubmit={handleSetSchoolCode} className="flex flex-col gap-4">
            <div className="text-left">
              <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">지역 선택</label>
              <select 
                className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-700 text-base bg-white"
                value={region}
                onChange={e => setRegion(e.target.value)}
                required
              >
                <option value="" disabled>지역을 선택해주세요</option>
                {regions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="text-left">
              <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">학교명 입력</label>
              <input 
                type="text" 
                placeholder="예: 김해은혜학교" 
                className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-800 text-base"
                value={schoolName}
                onChange={e => setSchoolName(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="bg-pastel-yellow text-gray-800 font-extrabold py-3.5 rounded-xl hover:bg-yellow-400 transition-colors text-base mt-2 shadow-md cursor-pointer">
              학교 등록 완료 및 시작하기
            </button>
          </form>
        </div>

        {/* 전국 학교 검색 모달 */}
        {showSchoolSearchModal && (
          <SchoolSearchModal
            searchKeyword={searchKeyword}
            setSearchKeyword={setSearchKeyword}
            searchRegionFilter={searchRegionFilter}
            setSearchRegionFilter={setSearchRegionFilter}
            searchResults={searchResults}
            isSearching={isSearching}
            onSearch={handleSearchNeis}
            onSelect={handleSelectNeisSchool}
            onClose={() => setShowSchoolSearchModal(false)}
          />
        )}
      </div>
    )
  }

  // 3. 교사 대시보드 메인 화면
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden shadow-sm border-2 border-white shrink-0 bg-white">
              <img src={`${import.meta.env.BASE_URL}teacher_icon.jpg`} alt="선생님" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800">선생님 관리자 페이지</h1>
              <p className="text-sm text-pastel-blue font-bold mt-0.5">🏫 우리 학교: {schoolCode}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
            <span className="text-gray-600 font-medium text-sm hidden md:inline">{user.email}</span>
            <button 
              onClick={() => setShowSchoolSearchModal(true)} 
              className="bg-emerald-50 text-emerald-700 border border-emerald-300 px-3 py-2 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
            >
              🔍 학교 변경/검색
            </button>
            <button onClick={handleLogout} className="bg-red-100 text-red-600 px-3 py-2 rounded-xl text-sm font-bold hover:bg-red-200 transition-colors shadow-sm cursor-pointer">
              로그아웃
            </button>
            <Link to="/" className="bg-white border-2 border-pastel-blue text-pastel-blue px-3 py-2 rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              메인화면
            </Link>
          </div>
        </div>

        {/* 45일 정리 알림 배너 */}
        {cleanupStatus && (
          <div className="mb-4 bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2.5 rounded-2xl text-xs md:text-sm font-bold flex items-center justify-between">
            <span>{cleanupStatus}</span>
            <button onClick={() => setCleanupStatus(null)} className="text-emerald-600 hover:text-emerald-900 ml-2">✕</button>
          </div>
        )}
        
        <MenuEditor schoolCode={schoolCode} />

        {/* 전국 학교 검색 모달 */}
        {showSchoolSearchModal && (
          <SchoolSearchModal
            searchKeyword={searchKeyword}
            setSearchKeyword={setSearchKeyword}
            searchRegionFilter={searchRegionFilter}
            setSearchRegionFilter={setSearchRegionFilter}
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
  searchResults,
  isSearching,
  onSearch,
  onSelect,
  onClose
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">🏫 전국 학교 검색 (나이스 NEIS)</h2>
            <p className="text-xs text-gray-500 mt-1">교육부 나이스 공공데이터에서 학교를 찾아 선택하시면 당일 식단을 1초 만에 가져옵니다.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold cursor-pointer">✕</button>
        </div>

        <form onSubmit={onSearch} className="flex gap-2 mb-4">
          <select 
            value={searchRegionFilter} 
            onChange={(e) => setSearchRegionFilter(e.target.value)}
            className="border-2 border-gray-200 p-2.5 rounded-xl font-bold text-gray-700 text-sm bg-white"
          >
            <option value="">전체 지역</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input 
            type="text" 
            placeholder="학교명 입력 (예: 은혜학교, 김해은혜)" 
            className="flex-1 border-2 border-gray-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-gray-800 text-sm"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            autoFocus
          />
          <button 
            type="submit" 
            disabled={isSearching}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-extrabold text-sm shadow-md transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSearching ? '검색 중...' : '검색'}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 border border-gray-100 p-2 rounded-2xl bg-gray-50">
          {searchResults.length === 0 ? (
            <div className="text-center py-12 text-gray-400 font-medium text-sm">
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
          className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full text-red-500 hover:bg-white hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-gray-100 cursor-pointer"
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
        <span className="text-xs text-gray-500 font-medium mb-2 pointer-events-none text-center group-hover:text-blue-600 transition-colors">클릭하여 사진 업로드<br/>(480px 고효율 압축)</span>
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

function MenuEditor({ schoolCode }) {
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
  const [statusMessage, setStatusMessage] = useState('')

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

      setStatusMessage(`⚡ 나이스 급식 ${neisData.dishList.length}개 메뉴를 1초 만에 불러왔습니다! (${neisData.calInfo || ''})`)
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
    } catch (error) {
      alert("Firebase 연동 실패. 로컬에 임시 저장합니다.\n에러: " + error.message)
      localStorage.setItem(`menus_${schoolCode}_${date}`, JSON.stringify(menus))
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-[2rem] shadow-xl p-6 md:p-10 border border-gray-100">
      <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4 bg-gray-50 p-4 rounded-2xl">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="font-bold text-gray-700 whitespace-nowrap text-sm md:text-base">날짜 선택:</label>
          <input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pastel-blue font-medium text-gray-700 w-full md:w-auto shadow-sm text-sm md:text-base"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* 나이스 당일 식단 1초 불러오기 버튼 */}
          <button
            onClick={handleFetchNeisToday}
            disabled={loadingNeis}
            className="flex-1 md:flex-none bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 px-6 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm md:text-base cursor-pointer"
          >
            {loadingNeis ? '불러오는 중...' : '⚡ 나이스 당일 식단 1초 불러오기'}
          </button>
          
          <button 
            onClick={saveMenu} 
            disabled={saving}
            className="flex-1 md:flex-none bg-pastel-blue text-gray-800 font-black py-3 px-8 rounded-xl hover:bg-blue-300 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2 text-sm md:text-base cursor-pointer"
          >
            {saving ? '저장 중...' : '💾 메뉴 저장하기'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="mb-4 bg-blue-50 text-blue-900 border border-blue-200 px-4 py-2.5 rounded-xl text-sm font-bold animate-fade-in flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage('')} className="text-blue-500 hover:text-blue-700 ml-2">✕</button>
        </div>
      )}

      <div className="w-full max-w-5xl mx-auto bg-gray-200 rounded-[3rem] p-4 md:p-6 shadow-inner relative flex gap-4 md:gap-6 aspect-video">
        <div className="grid grid-cols-4 grid-rows-[1fr_1.4fr] gap-4 md:gap-6 flex-1 min-h-0">
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

        <div className="w-16 md:w-24 shrink-0 flex flex-col h-full py-2">
          <div className="w-full h-full rounded-[3rem] border-[6px] border-gray-300 bg-gray-100 flex items-center justify-center shadow-inner overflow-hidden relative">
            <img src={`${import.meta.env.BASE_URL}utensils_flat.jpg`} alt="수저 세트" className="w-full h-full object-contain opacity-70 mix-blend-multiply scale-[1.4] md:scale-[1.5] origin-center" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-400 px-2">
        <span>🛡️ 용량 안심 관리: 사진 업로드 시 480px, 0.55 품질로 초고효율 압축됩니다.</span>
        <span>30일 이전 데이터는 백그라운드 자동 정리됩니다.</span>
      </div>
    </div>
  )
}
