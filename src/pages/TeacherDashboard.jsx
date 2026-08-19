import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db, storage } from '../firebase'
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

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
            const code = userDoc.data().schoolCode;
            setSchoolCode(code)
            setIsSchoolCodeSet(true)
            localStorage.setItem('schoolCode', code)
          } else {
            // Firestore에 코드가 없다면 로컬 코드도 초기화
            setSchoolCode('')
            setIsSchoolCodeSet(false)
            localStorage.removeItem('schoolCode')
          }
        } catch(e) { console.error(e) }
      } else if (!currentUser) {
        setSchoolCode('')
        setIsSchoolCodeSet(false)
        localStorage.removeItem('schoolCode')
      }
    })
    return () => unsubscribe()
  }, [])

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
          return alert("지역과 학교명을 모두 입력해주세요.")
        }

        // 1. 회원가입 처리
        const userCred = await createUserWithEmailAndPassword(auth, email, password)
        const newUser = userCred.user

        // 2. 학교 코드 생성 및 저장
        const code = `${region}_${schoolName.replace(/\s+/g, '')}`
        await setDoc(doc(db, 'users', newUser.uid), { schoolCode: code }, { merge: true })
        
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
      await signOut(auth)
    }
    
    navigate('/')
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4 relative">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md">
          <div className="flex flex-col items-center justify-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-full overflow-hidden shadow-md border-4 border-white shrink-0 bg-white">
              <img src="/teacher_icon.jpg" alt="선생님" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">교사 로그인</h1>
          </div>
          
          <form onSubmit={handleAuth} className="flex flex-col gap-5">
            <div className="flex flex-col gap-4">
              <input 
                type="email" 
                placeholder="이메일 주소" 
                className="border-2 border-gray-100 bg-gray-50 p-4 rounded-2xl focus:outline-none focus:border-pastel-blue focus:bg-white text-lg transition-all"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1.5">
                <input 
                  type="password" 
                  placeholder="비밀번호" 
                  className="border-2 border-gray-100 bg-gray-50 p-4 rounded-2xl focus:outline-none focus:border-pastel-blue focus:bg-white text-lg transition-all"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <div className="flex justify-end px-1">
                  <button 
                    type="button" 
                    onClick={handlePasswordReset} 
                    className="text-sm text-gray-400 font-medium hover:text-pastel-blue transition-colors"
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                </div>
              </div>
            </div>
            
            <button type="submit" onClick={() => setIsLogin(true)} className="bg-pastel-blue text-gray-800 font-extrabold py-4 rounded-2xl hover:bg-blue-300 transition-all text-lg mt-2 shadow-md hover:shadow-lg">
              로그인
            </button>
          </form>
          
          <div className="mt-8 pt-8 border-t-2 border-gray-50 flex flex-col items-center gap-5">
            <div className="flex items-center gap-2 text-gray-500 font-medium">
              <span>아직 계정이 없으신가요?</span>
              <button 
                className="text-pastel-blue font-bold hover:text-blue-500 transition-colors"
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

        {!isLogin && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white p-8 md:p-10 rounded-3xl shadow-2xl w-full max-w-xl relative my-8">
              <button 
                onClick={() => setIsLogin(true)}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="flex flex-col items-center justify-center gap-2 mb-6 mt-2">
                <h1 className="text-3xl font-extrabold text-gray-800">교사 회원가입</h1>
                <p className="text-gray-500 font-medium text-center">계정 정보와 학교 정보를 함께 입력해주세요.</p>
              </div>

              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-xl text-sm font-bold text-center mb-6 break-keep leading-relaxed border border-yellow-200 shadow-sm">
                💡 <b>안내:</b> 입력하신 지역과 학교명이 동일할 경우, <b>우리 학교의 선생님들과</b><br/><b>자동으로 연동</b>되어 식단 데이터를 함께 관리할 수 있습니다!
              </div>

              <form onSubmit={handleAuth} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">이메일</label>
                  <input 
                    type="email" 
                    placeholder="example@school.kr" 
                    className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full text-lg"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">비밀번호 입력</label>
                  <input 
                    type="password" 
                    placeholder="6자리 이상" 
                    className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full text-lg"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">비밀번호 확인</label>
                  <input 
                    type="password" 
                    placeholder="비밀번호 다시 입력" 
                    className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full text-lg"
                    value={passwordConfirm}
                    onChange={e => setPasswordConfirm(e.target.value)}
                    required
                  />
                </div>

                <div className="border-t border-gray-100 my-2 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">지역 선택</label>
                      <select 
                        className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full bg-white font-bold text-gray-700 text-lg"
                        value={region}
                        onChange={e => setRegion(e.target.value)}
                        required
                      >
                        <option value="" disabled>지역 선택</option>
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
                        className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-800 text-lg"
                        value={schoolName}
                        onChange={e => setSchoolName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" onClick={() => setIsLogin(false)} className="bg-pastel-blue text-gray-800 font-extrabold py-4 rounded-xl hover:bg-blue-300 transition-colors text-lg mt-4 shadow-md">
                  학교 정보 확인 및 회원가입 완료
                </button>
              </form>
            </div>
          </div>
        )}

        {resetMessage && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] overflow-y-auto">
            <div className="bg-white p-8 md:p-10 rounded-3xl shadow-2xl w-full max-w-sm text-center relative animate-fade-in-up">
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-5 ${resetMessage.type === 'success' ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
                {resetMessage.type === 'success' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                )}
              </div>
              <h3 className="text-xl font-extrabold text-gray-800 mb-2">{resetMessage.type === 'success' ? '메일 발송 완료' : '안내'}</h3>
              <p className="text-gray-600 font-medium mb-8 whitespace-pre-line leading-relaxed">{resetMessage.text}</p>
              <button 
                onClick={() => setResetMessage(null)}
                className="w-full bg-pastel-blue text-gray-800 font-extrabold py-3.5 rounded-2xl hover:bg-blue-300 transition-all text-lg shadow-md"
              >
                확인
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (user && !isSchoolCodeSet) {
    const handleSetSchoolCode = async (e) => {
      e.preventDefault()
      if (!region || !schoolName.trim()) return alert("지역과 학교명을 모두 입력해주세요.");
      const code = `${region}_${schoolName.replace(/\s+/g, '')}`
      
      try {
        if (localStorage.getItem('useLocalMock') !== 'true') {
          await setDoc(doc(db, 'users', user.uid), { schoolCode: code }, { merge: true })
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
          <h2 className="text-3xl font-extrabold mb-4 text-gray-800">🏫 우리 학교 등록하기</h2>
          <div className="bg-yellow-50 text-yellow-800 p-4 rounded-xl text-sm font-bold text-center mb-6 break-keep leading-relaxed border border-yellow-200 shadow-sm">
            💡 <b>안내:</b> 과거 계정이거나 학교 코드가 누락되었습니다. 기존 학교의 선생님들과 연동하기 위해 소속 학교 정보를 입력해주세요!
          </div>
          <form onSubmit={handleSetSchoolCode} className="flex flex-col gap-5">
            <div className="text-left">
              <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">지역 선택</label>
              <select 
                className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-700 text-lg bg-white"
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
                placeholder="학교명을 입력해 주세요." 
                className="border-2 border-gray-200 p-3.5 rounded-xl focus:outline-none focus:border-pastel-blue w-full font-bold text-gray-800 text-lg"
                value={schoolName}
                onChange={e => setSchoolName(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="bg-pastel-yellow text-gray-800 font-extrabold py-4 rounded-xl hover:bg-yellow-400 transition-colors text-lg mt-2 shadow-md">
              학교 등록 완료 및 시작하기
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden shadow-sm border-2 border-white shrink-0 bg-white">
              <img src="/teacher_icon.jpg" alt="선생님" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800">선생님 관리자 페이지</h1>
              <p className="text-sm text-pastel-blue font-bold mt-1">🏫 우리 학교 코드: {schoolCode}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-600 font-medium hidden md:inline">{user.email}</span>
            <button onClick={handleLogout} className="bg-red-100 text-red-600 px-4 py-2 rounded-xl font-bold hover:bg-red-200 transition-colors shadow-sm">
              로그아웃
            </button>
            <Link to="/" className="bg-white border-2 border-pastel-blue text-pastel-blue px-4 py-2 rounded-xl font-bold hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              메인화면 이동
            </Link>
          </div>
        </div>
        
        <MenuEditor schoolCode={schoolCode} />
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

  const handleMenuChange = (key, field, value) => {
    setMenus(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }))
  }

  const handleImageUpload = async (key, file) => {
    if (!file) return;
    const isMock = localStorage.getItem('useLocalMock') === 'true'
    
    const compressImage = (imageFile) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 600; 
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
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
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
  }, [date])

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
      <div className="mb-8 flex flex-col md:flex-row items-center justify-between gap-4 bg-gray-50 p-4 rounded-2xl">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <label className="font-bold text-gray-700 whitespace-nowrap">날짜 선택:</label>
          <input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-pastel-blue font-medium text-gray-700 w-full md:w-auto shadow-sm"
          />
        </div>
        
        <button 
          onClick={saveMenu} 
          disabled={saving}
          className="w-full md:w-auto bg-pastel-blue text-gray-800 font-black py-3 px-8 rounded-xl hover:bg-blue-300 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? '저장 중...' : '💾 급식 메뉴 저장하기'}
        </button>
      </div>

      <div className="w-full max-w-5xl mx-auto bg-gray-200 rounded-[3rem] p-4 md:p-6 shadow-inner relative flex gap-4 md:gap-6 aspect-[1.8/1]">
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
            <img src="/utensils_flat.jpg" alt="수저 세트" className="w-full h-full object-contain opacity-70 mix-blend-multiply scale-[1.4] md:scale-[1.5] origin-center" />
          </div>
        </div>
      </div>
    </div>
  )
}
