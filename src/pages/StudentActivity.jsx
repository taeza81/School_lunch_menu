import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Maximize, Minimize, Shrink, Expand, Home, Printer, Volume2, ChevronLeft, ChevronRight } from 'lucide-react'

// Steps: 1(요일송), 2(날짜), 3(날씨), 4(급식안내), 5(드래그앤드롭), 6(활동지)
export default function StudentActivity() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [date, setDate] = useState(new Date())
  const [menus, setMenus] = useState(null)
  const [isMiniMode, setIsMiniMode] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)

  const schoolCode = localStorage.getItem('schoolCode')

  useEffect(() => {
    // 컴포넌트 마운트 시 현재 전체화면 상태 동기화 (홈 이동 후 돌아왔을 때 대비)
    setIsFullScreen(!!document.fullscreenElement)

    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement)
      if (!document.fullscreenElement) {
        setIsMiniMode(false) // 전체화면 해제 시 축소 모드도 해제
      }
    }
    document.addEventListener('fullscreenchange', handleFullScreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange)
  }, [])

  const enterFullScreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(err => console.log(err))
    }
  }

  const enterWindowMode = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(err => console.log(err))
    }
    setIsMiniMode(false)
  }

  useEffect(() => {
    // 날짜별 급식 메뉴 불러오기
    const fetchMenu = async () => {
      // 날짜가 바뀌면 이전 데이터를 먼저 초기화!
      setMenus(null)

      const pad = n => n.toString().padStart(2, '0')
      // 로컬 시간 기준으로 yyyy-mm-dd 생성 (toISOString()은 UTC 기준이라 하루 전으로 나올 수 있음)
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      const isMock = localStorage.getItem('useLocalMock') === 'true'
      
      if (!schoolCode) return;

      try {
        if (isMock) {
          const localData = localStorage.getItem(`menus_${schoolCode}_${dateStr}`)
          if (localData) {
            setMenus(JSON.parse(localData))
          } else {
            setMenus(null)
          }
          return
        }
        
        const docRef = doc(db, 'schools', schoolCode, 'menus', dateStr)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          setMenus(docSnap.data().menus)
        } else {
          setMenus(null)
        }
      } catch (error) {
        console.error(error)
        const localData = localStorage.getItem(`menus_${schoolCode}_${dateStr}`)
        if (localData) {
          setMenus(JSON.parse(localData))
        } else {
          setMenus(null)
        }
      }
    }
    fetchMenu()
  }, [date, schoolCode])

  const nextStep = () => setStep(s => Math.min(s + 1, 7))
  const prevStep = () => setStep(s => Math.max(s - 1, 0))

  return (
    <div className={`${isFullScreen ? 'h-screen overflow-hidden print:overflow-visible print:h-auto' : 'min-h-screen'} bg-pastel-green p-4 flex flex-col ${isMiniMode ? 'justify-end items-center pb-12' : ''} print:p-0 print:bg-white print:block`}>
      <div className="flex justify-between items-center mb-4 no-print w-full max-w-[1600px] mx-auto shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden shadow-sm border-2 border-white shrink-0 bg-white">
            <img src={`${import.meta.env.BASE_URL}student_icon.jpg`} alt="학생" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">오늘의 급식 활동</h1>
        </div>
        <div className="flex gap-2 md:gap-4">
          <button 
            onClick={() => {
              if (isFullScreen) enterWindowMode()
              navigate('/')
            }}
            className="flex items-center gap-2 bg-white/80 hover:bg-white text-gray-700 font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <Home size={20} /> 홈
          </button>

          <button 
            onClick={isFullScreen ? enterWindowMode : enterFullScreen}
            className="flex items-center gap-2 bg-white/80 hover:bg-white text-gray-700 font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            {isFullScreen ? <><Minimize size={20} /> 창 모드</> : <><Maximize size={20} /> 전체 화면</>}
          </button>

          {isFullScreen && (
            <button 
              onClick={() => setIsMiniMode(!isMiniMode)}
              className="flex items-center gap-2 bg-white/80 hover:bg-white text-gray-700 font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              {isMiniMode ? <><Expand size={20} /> 화면 확대</> : <><Shrink size={20} /> 화면 축소</>}
            </button>
          )}
        </div>
      </div>
      
      <div className={`bg-white rounded-3xl shadow-xl overflow-hidden transition-transform duration-500 ease-in-out flex flex-col w-full max-w-[1600px] mx-auto flex-1 min-h-0 ${isMiniMode ? 'scale-[0.6] origin-bottom' : ''} print:transform-none print:overflow-visible print:shadow-none print:rounded-none print:block`}>
        
        {/* 콘텐츠 영역 */}
        <div className={`flex-1 flex flex-col p-4 md:p-8 print:p-0 print:overflow-visible ${[0, 2, 3, 4, 5].includes(step) ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {step === 0 && <Activity0 date={date} onSelectDate={(d) => { setDate(d); setStep(1); }} />}
          {step === 1 && <Activity1 />}
          {step === 2 && <Activity2 date={date} />}
          {step === 3 && <Activity3 />}
          {step === 4 && <Activity4 menus={menus} />}
          {step === 5 && <Activity5 menus={menus} isMiniMode={isMiniMode} />}
          {step === 6 && <Activity6 menus={menus} />}
          {step === 7 && <Activity7 menus={menus} />}
        </div>

        {/* 네비게이션 */}
        {step > 0 && (
          <div className="bg-gray-50 p-4 border-t flex justify-between items-center no-print">
            <button 
              onClick={prevStep} 
              disabled={step === 0}
              className="bg-pastel-blue px-6 py-3 rounded-2xl font-bold text-lg disabled:opacity-30 hover:bg-blue-300"
            >
              이전
            </button>
            
            <div className="flex gap-2">
              {[1,2,3,4,5,6,7].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full ${step === i ? 'bg-pastel-pink' : 'bg-gray-300'}`} />
              ))}
            </div>

            <button 
              onClick={nextStep} 
              disabled={step === 7}
              className="bg-pastel-blue px-6 py-3 rounded-2xl font-bold text-lg disabled:opacity-30 hover:bg-blue-300"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// 1. 요일송
function Activity1() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full min-h-full space-y-8 py-4">
      <h2 className="text-4xl md:text-5xl font-bold text-gray-800 text-center">🎵 일주일을 알아봅시다 (요일송)</h2>
      <div className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden shadow-2xl border-[12px] border-pastel-yellow">
        <iframe 
          width="100%" 
          height="100%"
          src="https://www.youtube-nocookie.com/embed/GOOtLgg9GyY?autoplay=0&rel=0"
          title="요일송"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowFullScreen
        ></iframe>
      </div>
    </div>
  )
}

// 2. 날짜와 요일 알아보기
function Activity2({ date }) {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const todayDate = date.getDate()
  const dayName = days[date.getDay()]
  const dayIndex = date.getDay()

  const firstDayOfMonth = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const [speakingIndex, setSpeakingIndex] = useState(-1) // 0: 월, 1: 일, 2: 요일

  const speakSequence = (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    const synth = window.speechSynthesis
    
    // 기존에 재생 중이거나 멈춰있는 음성이 있다면 강제로 완전히 취소
    synth.cancel()
    setSpeakingIndex(-1)

    // 크롬 브라우저 버그(cancel 직후 speak가 무시되는 현상)를 피하기 위해 약간의 지연시간을 둠
    setTimeout(() => {
      const utterances = [
        new SpeechSynthesisUtterance(`${month}월`),
        new SpeechSynthesisUtterance(`${todayDate}일`),
        new SpeechSynthesisUtterance(`${dayName}요일`)
      ]

      // 자연스러운 한국어 음성(성우) 찾기
      const voices = window.speechSynthesis.getVoices()
      let naturalVoice = voices.find(v => v.lang.includes('ko') && v.name.includes('Google')) // 1. 구글 제공 한국어 (가장 자연스러움)
      if (!naturalVoice) naturalVoice = voices.find(v => v.lang.includes('ko') && (v.name.includes('Natural') || v.name.includes('Premium'))) // 2. 프리미엄 내장 음성
      if (!naturalVoice) naturalVoice = voices.find(v => v.lang.includes('ko') && !v.name.includes('Heami')) // 3. 기본 기계음(Heami 등) 제외
      if (!naturalVoice) naturalVoice = voices.find(v => v.lang.includes('ko')) // 4. 최후의 수단

      // 크롬 버그(Garbage Collection으로 인해 음성이 중간에 끊기거나 onend 이벤트가 불리지 않는 현상) 방지
      window.__speechUtterances = utterances

      utterances.forEach(u => {
        if (naturalVoice) u.voice = naturalVoice
        u.lang = 'ko-KR'
        u.rate = 0.8 // 인지적 특성을 고려하여 약간 천천히
        u.pitch = 1.0 // 너무 튀지 않는 기본 피치로 설정
      })

      utterances[0].onstart = () => setSpeakingIndex(0)
      utterances[1].onstart = () => setSpeakingIndex(1)
      utterances[2].onstart = () => setSpeakingIndex(2)
      
      utterances[2].onend = () => setSpeakingIndex(-1)
      
      utterances.forEach(u => {
        u.onerror = (error) => {
          console.error("TTS 에러 발생:", error)
          setSpeakingIndex(-1)
        }
      })

      synth.speak(utterances[0])
      synth.speak(utterances[1])
      synth.speak(utterances[2])
    }, 50)
  }

  useEffect(() => {
    return () => window.speechSynthesis.cancel()
  }, [])

  // 캘린더 날짜 배열 생성
  const calendarCells = Array(firstDayOfMonth).fill(null)
  for (let i = 1; i <= daysInMonth; i++) calendarCells.push(i)
  const totalCells = Math.ceil(calendarCells.length / 7) * 7
  while (calendarCells.length < totalCells) calendarCells.push(null)

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full min-h-full space-y-3 md:space-y-4 py-4">
      <h2 className="text-3xl md:text-5xl font-bold text-gray-800 text-center flex-shrink-0">📅 오늘은 며칠, 무슨 요일일까요?</h2>
      
      <div 
        role="button"
        tabIndex={0}
        onClick={speakSequence}
        onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') speakSequence() }}
        className="w-full max-w-5xl bg-white border-4 border-gray-600 shadow-2xl flex flex-col transform hover:scale-[1.01] transition-transform cursor-pointer font-bold flex-1 min-h-0"
      >
        {/* 상단 (연도, 월) */}
        <div className="bg-[#FFC000] flex items-center justify-center py-2 md:py-3 border-b-4 border-gray-600 relative flex-shrink-0">
          <div className="text-blue-700 text-xl md:text-2xl font-bold absolute left-4 md:left-6 opacity-80">{year}년</div>
          
          {/* 'O월'을 전체적으로 감싸는 둥근 네모 형태의 테두리 */}
          <div className={`relative px-6 py-1 md:px-8 md:py-2 border-[4px] md:border-[6px] border-red-600 rounded-[1rem] md:rounded-[2rem] flex items-baseline gap-2 ${speakingIndex === 0 ? 'bg-red-500/30 scale-110 transition-transform' : 'bg-transparent'}`}>
            <span className="text-black z-10 text-4xl md:text-[5rem] leading-none font-bold">{month}</span>
            <span className="text-blue-700 z-10 text-3xl md:text-[4rem] leading-none font-bold">월</span>
          </div>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 border-b-4 border-gray-600 text-4xl md:text-6xl font-black flex-shrink-0">
          {days.map((d, idx) => {
            let bgClass = "bg-[#70AD47]"
            let textClass = "text-black"
            if (idx === 0) { bgClass = "bg-[#FF5050]"; textClass = "text-white" } // 일요일 빨강 배경
            else if (idx === 6) { bgClass = "bg-[#5B9BD5]"; textClass = "text-white" } // 토요일 파랑 배경

            const isTargetDay = idx === dayIndex
            
            return (
              <div key={idx} className={`${bgClass} ${textClass} border-r-2 border-gray-600 last:border-r-0 py-3 md:py-5 flex items-center justify-center relative`}>
                <span className="z-10">{d}</span>
                {isTargetDay && (
                  <div className={`absolute inset-0 m-auto border-[4px] md:border-[8px] border-red-600 rounded-full w-14 h-14 md:w-20 md:h-20 ${speakingIndex === 2 ? 'bg-red-500/30 scale-110 transition-transform' : ''}`}></div>
                )}
              </div>
            )
          })}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 bg-white flex-1 auto-rows-fr">
          {calendarCells.map((cell, idx) => {
            const isSunday = idx % 7 === 0
            const isSaturday = idx % 7 === 6
            let textClass = "text-black"
            if (isSunday) textClass = "text-[#FF0000]"
            else if (isSaturday) textClass = "text-[#0000FF]"

            const isToday = cell === todayDate

            return (
              <div key={idx} className={`border-r-2 border-b-2 border-gray-600 flex items-center justify-center relative ${idx % 7 === 6 ? 'border-r-0' : ''} ${idx >= totalCells - 7 ? 'border-b-0' : ''}`}>
                {cell && <span className={`${textClass} z-10 text-4xl md:text-6xl font-black`}>{cell}</span>}
                {isToday && (
                  <div className={`absolute inset-0 m-auto border-[4px] md:border-[8px] border-red-600 rounded-full w-14 h-14 md:w-20 md:h-20 ${speakingIndex === 1 ? 'bg-red-500/30 scale-110 transition-transform' : ''}`}></div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 오디오 힌트 */}
      <div className="flex items-center gap-2 md:gap-3 text-orange-500 text-xl md:text-2xl font-bold animate-pulse bg-orange-50 px-6 py-2 md:px-8 md:py-3 rounded-full shadow-sm border border-orange-200 flex-shrink-0">
        <Volume2 className="w-6 h-6 md:w-8 md:h-8" />
        달력을 누르면 소리로 읽어줘요!
      </div>
    </div>
  )
}

// 3. 오늘의 날씨 말하기
function Activity3() {
  const [selected, setSelected] = useState(null)
  const weathers = [
    { id: 'sunny', image: `${import.meta.env.BASE_URL}images/weather_sunny.jpg`, name: '맑음' },
    { id: 'cloudy', image: `${import.meta.env.BASE_URL}images/weather_cloudy.jpg`, name: '흐림' },
    { id: 'rainy', image: `${import.meta.env.BASE_URL}images/weather_rainy.jpg`, name: '비' },
    { id: 'snowy', image: `${import.meta.env.BASE_URL}images/weather_snowy.jpg`, name: '눈' },
  ]

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full min-h-full space-y-12 py-8">
      <h2 className="text-4xl md:text-5xl font-bold text-gray-800 text-center">🌤️ 오늘 날씨는 어떤가요?</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 w-full max-w-6xl">
        {weathers.map(w => (
          <button 
            key={w.id}
            onClick={() => setSelected(w.id)}
            className={`flex flex-col items-center p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] transition-all border-4 ${selected === w.id ? 'bg-blue-50 border-blue-400 scale-105 md:scale-110 shadow-2xl' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
          >
            <div className={`w-32 h-32 md:w-48 md:h-48 mb-4 md:mb-6 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden border-4 shadow-inner transition-all ${selected === w.id ? 'border-blue-300' : 'border-gray-100'}`}>
              <img src={w.image} alt={w.name} className="w-full h-full object-cover" />
            </div>
            <span className={`text-3xl md:text-4xl font-bold ${selected === w.id ? 'text-blue-700' : 'text-gray-800'}`}>{w.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// 4. 오늘의 급식 알아보기
function Activity4({ menus }) {
  if (!menus) return <div className="text-2xl text-center mt-20">아직 선생님이 오늘의 메뉴를 등록하지 않았어요!</div>

  const menuItems = Object.values(menus).filter(m => m && m.name)

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full min-h-full space-y-4 md:space-y-6 py-4">
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-800 text-center shrink-0">🍽️ 오늘의 급식 메뉴</h2>
      
      <div className="flex-1 w-full max-w-7xl min-h-0 grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {menuItems.map((item, idx) => (
          <div key={idx} className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-lg border-[6px] md:border-8 border-pastel-yellow overflow-hidden flex flex-col items-center p-3 md:p-5 min-h-0">
            <div className="w-full flex-1 bg-gray-50 rounded-[1.5rem] md:rounded-2xl overflow-hidden mb-3 md:mb-4 relative min-h-0 border-2 border-gray-100 shadow-inner">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="object-cover w-full h-full" />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-gray-400 text-xl font-bold">사진 없음</div>
              )}
            </div>
            <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center break-keep shrink-0">{item.name}</h3>
          </div>
        ))}
      </div>
    </div>
  )
}

// 5. 드래그 앤 드롭
function Activity5({ menus, isMiniMode }) {
  if (!menus) return <div className="text-2xl text-center mt-20">급식 메뉴가 없습니다.</div>

  const [items, setItems] = useState(() => {
    return Object.entries(menus)
      .filter(([_, m]) => m && m.name)
      .map(([key, m]) => ({ id: key, ...m }))
  })
  const [tray, setTray] = useState({
    rice: null, soup: null, side1: null, side2: null, side3: null, side4: null
  })
  
  // 터치&터치 기능을 위한 선택된 아이템 상태
  const [selectedItem, setSelectedItem] = useState(null)

  const onDragEnd = (result) => {
    if (!result.destination) return

    const { source, destination } = result
    
    // 리스트에서 식판으로 이동
    if (source.droppableId === 'menu-list' && destination.droppableId.startsWith('tray-')) {
      const targetSlot = destination.droppableId.replace('tray-', '')
      const draggedItem = items[source.index]
      
      // 정답 확인 로직: DB의 키값(id)과 식판 슬롯이 정확히 일치해야만 놓기 허용
      if (tray[targetSlot] === null && draggedItem.id === targetSlot) {
        setTray(prev => ({ ...prev, [targetSlot]: draggedItem }))
        const newItems = Array.from(items)
        newItems.splice(source.index, 1)
        setItems(newItems)
        setSelectedItem(null)
      }
    }
  }

  // 터치 & 터치 정답 확인 로직
  const handleSlotClick = (targetSlot) => {
    if (!selectedItem) return;
    
    if (tray[targetSlot] === null && selectedItem.id === targetSlot) {
      setTray(prev => ({ ...prev, [targetSlot]: selectedItem }))
      setItems(prev => prev.filter(i => i.id !== selectedItem.id))
      setSelectedItem(null)
    } else {
      // 틀린 곳을 터치했거나 이미 있는 곳을 터치하면 선택 해제
      setSelectedItem(null)
    }
  }

  const handleReset = () => {
    setItems(Object.entries(menus)
      .filter(([_, m]) => m && m.name)
      .map(([key, m]) => ({ id: key, ...m })))
    setTray({
      rice: null, soup: null, side1: null, side2: null, side3: null, side4: null
    })
    setSelectedItem(null)
  }

  const slotClass = "w-full h-full min-h-0 rounded-[2rem] border-4 border-gray-300 border-dashed flex items-center justify-center overflow-hidden bg-gray-50/50"

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full min-h-full space-y-4 py-4">
      <h2 className={`font-bold text-gray-800 text-center shrink-0 ${isMiniMode ? 'text-2xl' : 'text-4xl'}`}>🍱 알맞은 자리에 담아볼까요?</h2>
      
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-6 w-full max-w-[1500px] flex-1 min-h-0 items-center justify-between">
          
          {/* 6구 식판 UI (화면 크기에 맞춰 동적으로 최대 크기 계산) */}
          <div className="w-full mx-auto bg-[#E5E7EB] rounded-[2rem] md:rounded-[3rem] p-4 md:p-6 shadow-inner relative flex gap-4 md:gap-6 aspect-video shrink-0" style={{ maxWidth: 'min(64rem, calc((100vh - 300px) * 16 / 9))' }}>
            <div className="grid grid-cols-4 grid-rows-[1fr_1.4fr] gap-4 md:gap-6 flex-1 min-h-0">
              {/* 위쪽 줄: 반찬4개 */}
              <TraySlot id="side1" item={tray.side1} targetItem={menus?.side1} label="반찬 1" className={slotClass} onSlotClick={handleSlotClick} />
              <TraySlot id="side2" item={tray.side2} targetItem={menus?.side2} label="반찬 2" className={slotClass} onSlotClick={handleSlotClick} />
              <TraySlot id="side3" item={tray.side3} targetItem={menus?.side3} label="반찬 3" className={slotClass} onSlotClick={handleSlotClick} />
              <TraySlot id="side4" item={tray.side4} targetItem={menus?.side4} label="반찬 4" className={slotClass} onSlotClick={handleSlotClick} />
              
              {/* 아래쪽 줄: 밥, 국 (각각 2칸 차지) */}
              <div className="col-span-2 min-h-0">
                <TraySlot id="rice" item={tray.rice} targetItem={menus?.rice} label="🍚 밥" className={slotClass} onSlotClick={handleSlotClick} />
              </div>
              <div className="col-span-2 min-h-0">
                <TraySlot id="soup" item={tray.soup} targetItem={menus?.soup} label="🍲 국" className={slotClass} onSlotClick={handleSlotClick} />
              </div>
            </div>

            {/* 우측 수저통 영역 */}
            <div className="w-16 md:w-24 shrink-0 flex flex-col h-full py-2">
              <div className="w-full h-full rounded-[3rem] border-[6px] border-gray-300 bg-gray-100 flex items-center justify-center shadow-inner overflow-hidden relative">
                <img src={`${import.meta.env.BASE_URL}utensils_flat.jpg`} alt="수저 세트" className="w-full h-full object-contain opacity-70 mix-blend-multiply scale-[1.4] md:scale-[1.5] origin-center" />
              </div>
            </div>
          </div>

          {/* 남은 메뉴 리스트 (하단 가로 정렬, 1:1 정사각형 버튼) */}
          <Droppable droppableId="menu-list" direction="horizontal">
            {(provided) => (
              <div 
                ref={provided.innerRef} 
                {...provided.droppableProps}
                className="w-full max-w-[1200px] bg-pastel-pink/30 p-3 md:p-4 rounded-[2rem] shrink-0 flex items-center justify-center gap-3 md:gap-4 overflow-x-auto min-h-[110px] md:min-h-[130px]"
              >
                {items.length === 0 ? (
                  <div className="flex flex-col md:flex-row items-center gap-4 animate-fade-in">
                    <div className="text-gray-500 font-bold text-xl md:text-2xl">모두 담았어요! 👏</div>
                    <button 
                      onClick={handleReset}
                      className="bg-white text-gray-700 font-bold px-6 py-2 md:py-3 rounded-2xl shadow-sm border-2 border-gray-200 hover:border-pastel-blue hover:text-pastel-blue transition-colors flex items-center gap-2 text-base md:text-lg"
                    >
                      다시 하기 🔄
                    </button>
                  </div>
                ) : null}
                {items.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`w-24 h-24 md:w-32 md:h-32 bg-white rounded-[1.5rem] shadow-md border-[3px] border-white flex flex-col overflow-hidden shrink-0 cursor-pointer active:cursor-grabbing hover:scale-[1.02] transition-transform ${snapshot.isDragging ? 'shadow-2xl scale-110 z-50 ring-4 ring-pastel-blue' : ''} ${selectedItem?.id === item.id && !snapshot.isDragging ? 'ring-4 ring-pastel-pink scale-[1.05] shadow-xl z-40' : ''}`}
                      >
                        <div className="w-full flex-1 bg-gray-50 overflow-hidden relative">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm font-bold">사진 없음</div>
                          )}
                        </div>
                        <div className="w-full h-[30%] flex items-center justify-center bg-white border-t border-gray-100 px-2 shrink-0">
                          <span className="font-bold text-sm md:text-lg text-gray-800 truncate text-center">{item.name}</span>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {/* 
                  React-beautiful-dnd의 placeholder를 감춰버리면 공간이 무너지지 않음.
                  가로 모드에서 마지막에 빈 공간이 생기지 않도록 처리.
                */}
                <div className="hidden">{provided.placeholder}</div>
              </div>
            )}
          </Droppable>

        </div>
      </DragDropContext>
    </div>
  )
}

function TraySlot({ id, item, targetItem, label, className, onSlotClick }) {
  return (
    <Droppable droppableId={`tray-${id}`}>
      {(provided, snapshot) => (
        <div 
          onClick={() => onSlotClick && onSlotClick(id)}
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`${className} cursor-pointer relative ${snapshot.isDraggingOver ? 'bg-pastel-blue/30 border-pastel-blue ring-8 ring-pastel-blue/30 scale-[1.02] transition-all z-10' : 'transition-all'}`}
        >
          {/* 안쪽 카드 영역 (항상 존재하여 모양을 동일하게 유지) */}
          <div className="absolute inset-0 w-full h-full p-2 md:p-3">
            <div className="w-full h-full bg-white rounded-2xl md:rounded-[1.5rem] shadow-sm flex flex-col items-center justify-center overflow-hidden border-2 border-gray-100 relative group bg-gray-50">
              
              {item ? (
                /* 음식이 놓였을 때 (선명한 사진 + 이름) */
                <>
                  {item.imageUrl && <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover" />}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 md:p-3 flex items-center justify-center backdrop-blur-sm shadow-[0_-10px_20px_rgba(0,0,0,0.3)]">
                    <span className="font-bold text-white text-base md:text-xl truncate text-center">{item.name}</span>
                  </div>
                </>
              ) : (
                /* 빈칸일 때 (흐릿한 흑백 힌트 + 칸 이름) */
                <>
                  {targetItem && targetItem.imageUrl && (
                    <img src={targetItem.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-20 grayscale" />
                  )}
                </>
              )}

            </div>
          </div>
          
          <div className="hidden">{provided.placeholder}</div>
        </div>
      )}
    </Droppable>
  )
}

// 6. 활동지 프린트
function Activity6({ menus }) {
  if (!menus) return null;
  const menuItems = Object.values(menus).filter(m => m && m.name)

  return (
    <div className="flex flex-col items-center h-full space-y-6">
      <div className="flex justify-between items-center w-full max-w-4xl no-print">
        <h2 className="text-4xl font-bold text-gray-800">📝 (활동지) 급식 메뉴 이름 쓰기</h2>
        <button onClick={() => window.print()} className="bg-pastel-blue hover:bg-blue-300 px-6 py-3 rounded-2xl font-bold text-lg flex items-center gap-2 shadow-md">
          <Printer /> 인쇄하기
        </button>
      </div>
      
      {/* A4 용지 형태의 프리뷰 (화면용 & 인쇄용 공통) */}
      <style type="text/css" media="print">
        {`
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        `}
      </style>
      <div className="bg-white w-full max-w-[210mm] aspect-[210/297] shadow-2xl px-[5mm] py-[10mm] flex flex-col border border-gray-200 print:shadow-none print:border-none print:w-[210mm] print:h-[275mm] print:px-[5mm] print:py-[10mm] print:m-0 box-border print:max-w-none print:aspect-auto">
        
        <div className="flex flex-col gap-[6mm] border-b-4 border-gray-800 pb-2 mb-3">
          <h1 className="text-[7mm] font-black text-gray-800 text-center">오늘의 급식 메뉴 이름 쓰기</h1>
          <div className="text-[4mm] font-bold flex justify-end gap-4 text-gray-700">
            <span>____월 ____일</span>
            <span>이름: ______________</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-[3mm] min-h-0 w-full">
          {menuItems.map((item, idx) => (
            <div key={idx} className="flex flex-row items-center p-[2mm] border-2 border-dashed border-gray-300 rounded-[3mm] flex-1 min-h-[30mm] w-full gap-[4mm]">
              {/* 사진 영역 (절대 크기 고정으로 축소 방지) */}
              <div className="w-[25mm] h-[25mm] relative bg-gray-100 rounded-[2mm] overflow-hidden print:border print:border-gray-300 shrink-0">
                 {item.imageUrl && <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover" />}
              </div>
              
              {/* 따라쓰기 영역 (10글자 최대) */}
              <div className="flex-1 flex justify-start items-center">
                {item.name.trim().split('').map((char, i) => (
                  <div key={`trace-${i}`} className={`w-[15mm] h-[15mm] border-[1px] border-gray-800 flex items-center justify-center bg-white shrink-0 ${i !== 0 ? 'border-l-0' : ''}`}>
                    {char !== ' ' && (
                      <span 
                        className="font-black font-sans text-[11mm]" 
                        style={{ 
                          color: 'white', 
                          textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, -1.5px 0 0 #000, 1.5px 0 0 #000, 0 -1.5px 0 #000, 0 1.5px 0 #000' 
                        }}
                      >
                        {char}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


// 7. 식판 메뉴 따라 붙이기 활동지
function Activity7({ menus }) {
  if (!menus) return null;
  const menuItems = Object.entries(menus)
    .filter(([_, m]) => m && m.name)
    .map(([key, m]) => ({ id: key, ...m }));

  return (
    <div className="flex flex-col items-center h-full space-y-6 overflow-y-auto w-full">
      <div className="flex justify-between items-center w-full max-w-4xl no-print shrink-0 px-4 mt-4">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}glue_icon_new.jpg`} alt="풀" className="h-[2.5em] w-[2.5em] object-contain mix-blend-multiply -my-4 -ml-4 -mr-2" />
          <span>(활동지) 식판 메뉴 따라 붙이기</span>
        </h2>
        <button onClick={() => window.print()} className="bg-pastel-blue hover:bg-blue-300 px-6 py-3 rounded-2xl font-bold text-lg flex items-center gap-2 shadow-md">
          <Printer /> 인쇄하기
        </button>
      </div>

      <style type="text/css" media="print">
        {`
          @page { size: A4 landscape; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page-break { page-break-after: always; }
        `}
      </style>

      <div className="flex flex-col gap-8 w-full items-center pb-10 print:pb-0 print:gap-0 overflow-x-auto print:overflow-visible print:block">
        
        {/* PAGE 1: Tray with grayscale items */}
        <div className="bg-white w-[297mm] h-[210mm] print:w-[100vw] print:h-[100vh] shrink-0 shadow-2xl flex flex-col border border-gray-200 print:shadow-none print:border-none print:m-0 box-border relative overflow-hidden page-break mx-auto">
          <div className="absolute top-0 left-0 w-full flex justify-between items-center px-[8mm] py-[5mm] print:px-[3%] print:py-[2%]">
             <h1 className="text-[8mm] print:text-[3vw] font-black text-gray-800">식판 메뉴 따라 붙이기</h1>
             <div className="text-[4.5mm] print:text-[1.5vw] font-bold text-gray-700">
               <span>____년 ____월 ____일 &nbsp; 이름: ______________</span>
             </div>
          </div>
          
          {/* Tray Design */}
          <div className="absolute top-[20mm] print:top-[11%] left-[50%] translate-x-[-50%] w-[285mm] h-[184mm] print:w-[96%] print:h-[86%] bg-[#E5E7EB] rounded-[15mm] print:rounded-[3vw] p-[8mm] print:p-[2%] shadow-inner flex gap-[6mm] print:gap-[2%] border border-gray-300">
            <div className="grid grid-cols-4 grid-rows-[1fr_1.4fr] gap-[6mm] print:gap-[2%] flex-1">
              {['side1', 'side2', 'side3', 'side4'].map(slot => {
                const item = menuItems.find(m => m.id === slot);
                return (
                  <div key={slot} className="w-full h-full bg-white rounded-[8mm] print:rounded-[2vw] shadow-sm flex flex-col items-center justify-center overflow-hidden border border-gray-300 relative">
                    {item && item.imageUrl && <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale" />}
                  </div>
                )
              })}
              <div className="col-span-2 w-full h-full bg-white rounded-[8mm] print:rounded-[2vw] shadow-sm flex flex-col items-center justify-center overflow-hidden border border-gray-300 relative">
                 {(() => {
                   const item = menuItems.find(m => m.id === 'rice');
                   return item && item.imageUrl && <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale" />
                 })()}
              </div>
              <div className="col-span-2 w-full h-full flex flex-col items-center justify-center">
                 <div className="w-[98%] h-[98%] bg-white rounded-full shadow-sm flex flex-col items-center justify-center overflow-hidden border border-gray-300 relative">
                   {(() => {
                     const item = menuItems.find(m => m.id === 'soup');
                     return item && item.imageUrl && <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale" />
                   })()}
                 </div>
              </div>
            </div>
            
            {/* Utensils Placeholder */}
            <div className="w-[20mm] print:w-[8%] shrink-0 h-full rounded-[8mm] print:rounded-[2vw] border-[1.5mm] print:border-[0.4vw] border-gray-300 bg-gray-100 flex items-center justify-center overflow-hidden relative">
               <img src={`${import.meta.env.BASE_URL}utensils_flat.jpg`} alt="" className="absolute w-[150%] h-[150%] object-contain opacity-70 mix-blend-multiply scale-[1.5]" />
            </div>
          </div>
        </div>

        {/* PAGE 2: Color items with dotted lines */}
        <div className="bg-white w-[297mm] h-[210mm] print:w-[100vw] print:h-[100vh] shrink-0 shadow-2xl flex flex-col border border-gray-200 print:shadow-none print:border-none print:m-0 box-border relative overflow-hidden mx-auto">
          <div className="absolute top-[20mm] print:top-[11%] left-[50%] translate-x-[-50%] w-[285mm] h-[184mm] print:w-[96%] print:h-[86%] flex gap-[6mm] print:gap-[2%] p-[8mm] print:p-[2%]">
            <div className="grid grid-cols-4 grid-rows-[1fr_1.4fr] gap-[6mm] print:gap-[2%] flex-1">
              {['side1', 'side2', 'side3', 'side4'].map(slot => {
                const item = menuItems.find(m => m.id === slot);
                return (
                  <div key={slot} className="w-full h-full flex items-center justify-center">
                    {item && item.imageUrl && (
                      <div className="w-full h-full rounded-[8mm] print:rounded-[2vw] border-[2.5mm] print:border-[0.6vw] border-dashed border-gray-800 p-1 overflow-hidden bg-white relative">
                        <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover rounded-[5mm] print:rounded-[1.5vw]" />
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="col-span-2 w-full h-full flex items-center justify-center">
                 {(() => {
                   const item = menuItems.find(m => m.id === 'rice');
                   return item && item.imageUrl && (
                      <div className="w-full h-full rounded-[8mm] print:rounded-[2vw] border-[2.5mm] print:border-[0.6vw] border-dashed border-gray-800 p-1 overflow-hidden bg-white relative">
                        <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover rounded-[5mm] print:rounded-[1.5vw]" />
                      </div>
                   )
                 })()}
              </div>
              <div className="col-span-2 w-full h-full flex items-center justify-center">
                 {(() => {
                   const item = menuItems.find(m => m.id === 'soup');
                   return item && item.imageUrl && (
                      <div className="w-[98%] h-[98%] rounded-full border-[2.5mm] print:border-[0.6vw] border-dashed border-gray-800 p-1 overflow-hidden bg-white relative">
                        <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover rounded-full" />
                      </div>
                   )
                 })()}
              </div>
            </div>
            <div className="w-[20mm] shrink-0 h-full"></div>
          </div>
        </div>

      </div>
    </div>
  )
}


// 0. 날짜 선택 캘린더
function Activity0({ date, onSelectDate }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [savedDates, setSavedDates] = useState([])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const days = ['일', '월', '화', '수', '목', '금', '토']
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const schoolCode = localStorage.getItem('schoolCode')
  const isMock = localStorage.getItem('useLocalMock') === 'true'

  useEffect(() => {
    const fetchDates = async () => {
      if (!schoolCode) return;
      const dates = [];
      try {
        if (!isMock) {
          const querySnapshot = await getDocs(collection(db, 'schools', schoolCode, 'menus'));
          querySnapshot.forEach(doc => dates.push(doc.id));
        } else {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(`menus_${schoolCode}_`)) {
              dates.push(key.replace(`menus_${schoolCode}_`, ''));
            }
          }
        }
        setSavedDates(dates);
      } catch (e) {
        console.error("Failed to load saved dates", e);
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith(`menus_${schoolCode}_`)) {
            dates.push(key.replace(`menus_${schoolCode}_`, ''));
          }
        }
        setSavedDates(dates);
      }
    }
    fetchDates();
  }, [schoolCode, isMock, month, year]);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const todayDate = new Date()

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0 space-y-4 md:space-y-6 py-2">
      <h2 className="text-3xl md:text-5xl font-bold text-gray-800 text-center shrink-0">활동 날짜를 선택해주세요</h2>
      
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl border-4 border-pastel-yellow p-4 md:p-8 flex flex-col min-h-0 flex-1 mb-4">
        {/* Calendar Header */}
        <div className="flex justify-between items-center mb-4 md:mb-6 shrink-0">
          <button onClick={prevMonth} className="p-2 md:p-3 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
            <ChevronLeft size={32} className="text-gray-700" />
          </button>
          <h3 className="text-2xl md:text-4xl font-bold text-gray-800">
            {year}년 {month + 1}월
          </h3>
          <button onClick={nextMonth} className="p-2 md:p-3 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
            <ChevronRight size={32} className="text-gray-700" />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2 md:gap-4 flex-1 min-h-0">
          {days.map(d => (
            <div key={d} className="text-center font-bold text-base md:text-xl text-gray-500 py-1 shrink-0">
              {d}
            </div>
          ))}
          
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="p-1" />
          ))}
          
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1
            const isToday = todayDate.getFullYear() === year && todayDate.getMonth() === month && todayDate.getDate() === dayNum
            
            const pad = n => n.toString().padStart(2, '0')
            const dateStr = `${year}-${pad(month + 1)}-${pad(dayNum)}`
            const hasMenu = savedDates.includes(dateStr)

            return (
              <button
                key={dayNum}
                onClick={() => onSelectDate(new Date(year, month, dayNum))}
                className={`
                  w-full h-full min-h-[50px] flex flex-col items-center justify-center rounded-xl md:rounded-2xl text-xl md:text-3xl font-bold transition-all relative
                  ${isToday 
                    ? 'bg-pastel-pink text-white ring-4 ring-pastel-pink/30' 
                    : (hasMenu 
                        ? 'bg-blue-50 text-blue-800 border-2 border-pastel-blue hover:bg-pastel-blue hover:text-white' 
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-200')}
                  shadow-sm hover:shadow-md hover:scale-105
                `}
              >
                <span>{dayNum}</span>
                {hasMenu && (
                  <div className={`absolute bottom-1 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${isToday ? 'bg-white' : 'bg-pastel-blue'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
