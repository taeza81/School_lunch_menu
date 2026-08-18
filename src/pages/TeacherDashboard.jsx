import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { auth, db, storage } from '../firebase'
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

export default function TeacherDashboard() {
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)

  const [schoolCode, setSchoolCode] = useState(localStorage.getItem('schoolCode') || '')
  const [isSchoolCodeSet, setIsSchoolCodeSet] = useState(!!localStorage.getItem('schoolCode'))
  const [region, setRegion] = useState('')
  const [schoolName, setSchoolName] = useState('')

  useEffect(() => {
    // 로컬 모드인지 확인
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
          }
        } catch(e) { console.error(e) }
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
        await createUserWithEmailAndPassword(auth, email, password)
      }
      localStorage.setItem('useLocalMock', 'false')
    } catch (error) {
      alert("인증 오류: " + error.message)
    }
  }

  const handleGuestLogin = () => {
    localStorage.setItem('useLocalMock', 'true')
    setUser({ email: 'guest@test.com (로컬 테스트 모드)' })
  }

  const handleLogout = async () => {
    if (localStorage.getItem('useLocalMock') === 'true') {
      localStorage.removeItem('useLocalMock')
      setUser(null)
      return
    }
    await signOut(auth)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden shadow-sm border-2 border-white shrink-0 bg-white">
              <img src="/teacher_icon.jpg" alt="선생님" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">교사 로그인</h1>
          </div>
          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <input 
              type="email" 
              placeholder="이메일" 
              className="border p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-pastel-blue"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input 
              type="password" 
              placeholder="비밀번호" 
              className="border p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-pastel-blue"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="bg-pastel-blue text-gray-800 font-bold py-3 rounded-xl hover:bg-blue-300 transition-colors">
              {isLogin ? '로그인' : '회원가입'}
            </button>
          </form>
          <button 
            className="mt-4 text-sm text-gray-500 w-full text-center hover:underline"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? '계정이 없으신가요? 회원가입하기' : '이미 계정이 있으신가요? 로그인하기'}
          </button>
          
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button 
              onClick={handleGuestLogin}
              className="w-full bg-pastel-yellow text-gray-800 font-bold py-3 rounded-xl hover:bg-yellow-300 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              🛠️ 로컬 테스트 모드로 로그인 (DB 없이 체험)
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">Firebase 설정 없이 브라우저 저장소로 테스트합니다.</p>
          </div>

          <div className="mt-6 text-center">
            <Link to="/" className="text-pastel-blue font-bold hover:underline">← 처음으로 돌아가기</Link>
          </div>
        </div>
      </div>
    )
  }

  if (user && !isSchoolCodeSet) {
    const handleSetSchoolCode = async (e) => {
      e.preventDefault()
      if (!region || !schoolName.trim()) {
        alert("지역과 학교명을 모두 입력해주세요.");
        return;
      }
      // 공백 제거하여 코드 생성 (예: 서울_행복학교)
      const cleanSchoolName = schoolName.replace(/\s+/g, '')
      const code = `${region}_${cleanSchoolName}`
      
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

    const regions = [
      "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", 
      "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
    ]

    return (
      <div className="min-h-screen bg-pastel-blue flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-4">🏫 우리 학교 등록하기</h2>
          <p className="text-gray-600 mb-6 text-sm break-keep">
            지역과 학교명을 선택/입력해주세요.<br/>
            (같은 지역과 학교명을 입력한 선생님들과 식단이 자동 공유됩니다.)
          </p>
          <form onSubmit={handleSetSchoolCode} className="flex flex-col gap-4">
            <select 
              className="border-2 border-gray-300 p-3 rounded-xl focus:outline-none focus:border-pastel-blue text-center text-lg font-bold text-gray-700"
              value={region}
              onChange={e => setRegion(e.target.value)}
              required
            >
              <option value="" disabled>지역을 선택하세요</option>
              {regions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input 
              type="text" 
              placeholder="예: 행복특수학교" 
              className="border-2 border-gray-300 p-3 rounded-xl focus:outline-none focus:border-pastel-blue text-center text-lg font-bold"
              value={schoolName}
              onChange={e => setSchoolName(e.target.value)}
              required
            />
            <button type="submit" className="bg-pastel-blue text-gray-800 font-bold py-3 rounded-xl hover:bg-blue-300 transition-colors mt-2">
              등록 및 시작하기
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
          <div className="flex items-center gap-4">
            <span className="text-gray-600 font-medium">{user.email}</span>
            <button onClick={handleLogout} className="bg-red-100 text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-200 transition-colors">로그아웃</button>
            <Link to="/" className="text-pastel-blue font-bold hover:underline">← 처음으로</Link>
          </div>
        </div>
        
        <MenuEditor schoolCode={schoolCode} />
      </div>
    </div>
  )
}

const MenuInputSlot = ({ keyName, item, label, handleMenuChange, handleImageUpload }) => (
  <div className="bg-white rounded-3xl p-3 md:p-4 shadow-sm border-[3px] border-gray-100 flex flex-col gap-2 transition-transform hover:scale-[1.02] h-full min-h-0">
    
    {/* 1. 입력 칸 명칭 (배지 스타일) */}
    <div className="flex justify-center">
      <span className="bg-blue-50 text-blue-800 border border-blue-200 font-extrabold px-5 py-1.5 rounded-full text-sm shadow-sm tracking-wide">
        {label}
      </span>
    </div>
    
    {/* 2. 사진 영역 */}
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

    {/* 3. 메뉴 이름 입력 */}
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
    
    // 파일(이미지)을 브라우저에서 바로 압축하여 Base64 텍스트로 변환하는 로직
    const compressImage = (imageFile) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 600; // 최대 해상도를 600px로 제한하여 용량 최소화
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
            // JPEG 형식으로 60% 품질로 압축 (Firestore 1MB 문서 제한에 충분히 들어감)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            resolve(dataUrl);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(imageFile);
      });
    };

    try {
      // Storage를 거치지 않고 압축된 Base64 데이터를 바로 적용
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
          {/* 위쪽 줄: 반찬4개 */}
          <MenuInputSlot keyName="side1" item={menus.side1} label="반찬1" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          <MenuInputSlot keyName="side2" item={menus.side2} label="반찬2" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          <MenuInputSlot keyName="side3" item={menus.side3} label="반찬3" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          <MenuInputSlot keyName="side4" item={menus.side4} label="반찬4" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          
          {/* 아래쪽 줄: 밥, 국 (각각 2칸 차지) */}
          <div className="col-span-2 min-h-0">
            <MenuInputSlot keyName="rice" item={menus.rice} label="🍚 밥" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          </div>
          <div className="col-span-2 min-h-0">
            <MenuInputSlot keyName="soup" item={menus.soup} label="🍲 국" handleMenuChange={handleMenuChange} handleImageUpload={handleImageUpload} />
          </div>
        </div>

        {/* 우측 수저통 영역 */}
        <div className="w-16 md:w-24 shrink-0 flex flex-col h-full py-2">
          <div className="w-full h-full rounded-[3rem] border-[6px] border-gray-300 bg-gray-100 flex items-center justify-center shadow-inner overflow-hidden relative">
            <img src="/utensils_flat.jpg" alt="수저 세트" className="w-full h-full object-contain opacity-70 mix-blend-multiply scale-[1.4] md:scale-[1.5] origin-center" />
          </div>
        </div>
      </div>
    </div>
  )
}
