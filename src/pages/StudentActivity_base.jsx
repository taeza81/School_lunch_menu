import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Maximize, Minimize, Shrink, Expand, Home, Printer, Volume2 } from 'lucide-react'

// Steps: 1(요일송), 2(날짜), 3(날씨), 4(급식안내), 5(드래그앤드롭), 6(활동지)
export default function StudentActivity() {
  const [step, setStep] = useState(1)
  const [date, setDate] = useState(new Date())
  const [menus, setMenus] = useState(null)
  const [isMiniMode, setIsMiniMode] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)

  const schoolCode = localStorage.getItem('schoolCode')

  useEffect(() => {
    setIsFullScreen(!!document.fullscreenElement)

    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement)
      if (!document.fullscreenElement) {
        setIsMiniMode(false) 
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
    const fetchMenu = async () => {
      const dateStr = date.toISOString().split('T')[0]
      
      if (!schoolCode) return;

      try {
        const docRef = doc(db, 'schools', schoolCode, 'menus', dateStr)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          setMenus(docSnap.data().menus)
        }
      } catch (error) {
        console.error(error)
        const localData = localStorage.getItem(`menus_${schoolCode}_${dateStr}`)
        if (localData) {
          setMenus(JSON.parse(localData))
        }
      }
    }
    fetchMenu()
  }, [date])

  const nextStep = () => setStep(s => Math.min(s + 1, 6))
  const prevStep = () => setStep(s => Math.max(s - 1, 1))

  const renderStep = () => {
    switch(step) {
      case 1: return <Activity1 />
      case 2: return <Activity2 date={date} />
      case 3: return <Activity3 />
      case 4: return <Activity4 menus={menus} />
      case 5: return <Activity5 menus={menus} />
      case 6: return <Activity6 menus={menus} />
      default: return null
    }
  }

  if (!schoolCode) {
    return (
      <div className="min-h-screen bg-pastel-yellow flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-3xl md:text-5xl font-bold text-gray-800 mb-6">🏫 학교 코드가 설정되지 않았습니다</h1>
        <p className="text-xl md:text-2xl text-gray-700 mb-10 break-keep">
          선생님 관리자 페이지에서 먼저 로그인하여<br/>우리 학교 코드를 연동해주세요!
        </p>
        <Link to="/teacher" className="bg-pastel-blue text-gray-800 font-bold text-2xl py-4 px-10 rounded-3xl hover:bg-blue-300 transition-colors shadow-lg">
          선생님 페이지로 이동하기
        </Link>
      </div>
    )
  }

  return (
    <div className={`${isFullScreen ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-pastel-green p-4 flex flex-col ${isMiniMode ? 'justify-end items-center pb-12' : ''}`}>
      <div className="flex justify-between items-center mb-4 no-print w-full max-w-[1600px] mx-auto shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden shadow-sm border-2 border-white shrink-0 bg-white">
            <img src="./student_icon.jpg" alt="학생" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">오늘의 급식 활동</h1>
        </div>
        <div className="flex gap-3">
          <Link to="/" className="flex items-center gap-2 bg-white/80 hover:bg-white text-gray-700 font-bold px-4 py-2 rounded-xl transition-colors shadow-sm">
            <Home size={20} /> 홈
          </Link>

          {!isFullScreen && (
            <button 
              onClick={enterFullScreen}
              className="flex items-center gap-2 bg-white/80 hover:bg-white text-gray-700 font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              <Maximize size={20} /> 전체 화면
            </button>
          )}
          {isFullScreen && !isMiniMode && (
            <button 
              onClick={() => setIsMiniMode(true)}
              className="flex items-center gap-2 bg-white/80 hover:bg-white text-gray-700 font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              <Shrink size={20} /> 화면 축소 (아래로)
            </button>
          )}
          {isFullScreen && isMiniMode && (
            <button 
              onClick={() => setIsMiniMode(false)}
              className="flex items-center gap-2 bg-white/80 hover:bg-white text-gray-700 font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              <Expand size={20} /> 원래 크기
            </button>
          )}
          {isFullScreen && (
            <button 
              onClick={enterWindowMode}
              className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-600 font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              <Minimize size={20} /> 창 모드
            </button>
          )}
        </div>
      </div>

      <div className={`flex-1 flex flex-col bg-white rounded-3xl shadow-xl border-4 border-white overflow-hidden relative transition-all duration-500 ease-in-out ${isMiniMode ? 'h-[300px] max-w-[800px] w-full mx-auto shadow-2xl scale-95' : 'w-full max-w-[1600px] mx-auto min-h-0'}`}>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar">
          {renderStep()}
        </div>
        
        {/* Navigation Bar */}
        <div className="bg-gray-50 border-t-2 border-gray-100 p-4 shrink-0 flex justify-between items-center no-print">
          <button 
            onClick={prevStep}
            disabled={step === 1}
            className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 font-bold text-xl py-3 px-8 rounded-2xl transition-colors shadow-sm"
          >
            ◀ 이전
          </button>
          
          <div className="flex gap-2 hidden md:flex">
            {[1,2,3,4,5,6].map(s => (
              <div 
                key={s} 
                className={`w-4 h-4 rounded-full transition-colors ${step === s ? 'bg-pastel-blue' : 'bg-gray-300'}`}
              />
            ))}
          </div>

          <button 
            onClick={nextStep}
            disabled={step === 6}
            className="bg-pastel-blue hover:bg-blue-300 disabled:opacity-50 text-gray-800 font-bold text-xl py-3 px-8 rounded-2xl transition-colors shadow-sm"
          >
            다음 ▶
          </button>
        </div>
      </div>
    </div>
  )
}

// 1. 요일송
function Activity1() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h2 className="text-4xl md:text-5xl font-bold text-gray-800 mb-8 text-center break-keep">🎵 다같이 요일송을 불러봐요!</h2>
      <div className="w-full max-w-4xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl relative group">
        {/* YouTube Embed Placeholder */}
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
           <iframe 
            className="w-full h-full"
            src="https://www.youtube.com/embed/mBq2F1l7Gaw?autoplay=1" 
            title="YouTube video player" 
            frameBorder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            referrerPolicy="strict-origin-when-cross-origin" 
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </div>
  )
}

// 2. 날짜 알아보기
function Activity2({ date }) {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dayOfWeek = days[date.getDay()]

  const [isPlaying, setIsPlaying] = useState(false)

  const speakDate = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel() // 기존 음성 취소
      const text = `오늘은 ${month}월 ${day}일 ${dayOfWeek}요일 입니다.`
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'ko-KR'
      utterance.rate = 0.8 // 약간 느리게
      
      utterance.onstart = () => setIsPlaying(true)
      utterance.onend = () => setIsPlaying(false)
      
      window.speechSynthesis.speak(utterance)
    } else {
      alert('이 브라우저에서는 음성 읽어주기를 지원하지 않습니다.')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-12">
      <h2 className="text-4xl md:text-5xl font-bold text-gray-800 text-center break-keep flex items-center gap-4">
        📅 오늘은 몇 월 며칠일까요?
        <button 
          onClick={speakDate}
          className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-110 ${isPlaying ? 'bg-blue-400 text-white animate-pulse' : 'bg-pastel-blue text-gray-800'}`}
          title="날짜 읽어주기"
        >
          <Volume2 size={32} />
        </button>
      </h2>
      <div className="flex flex-wrap justify-center gap-4 md:gap-8 font-black text-5xl md:text-8xl text-gray-800">
        <div className="bg-pastel-pink px-8 py-6 rounded-3xl shadow-lg border-4 border-white">{month}월</div>
        <div className="bg-pastel-yellow px-8 py-6 rounded-3xl shadow-lg border-4 border-white">{day}일</div>
        <div className="bg-pastel-blue px-8 py-6 rounded-3xl shadow-lg border-4 border-white">{dayOfWeek}요일</div>
      </div>
    </div>
  )
}

// 3. 날씨 고르기
function Activity3() {
  const [weather, setWeather] = useState(null)
  const weathers = [
    { id: 'sunny', emoji: '☀️', name: '맑음' },
    { id: 'cloudy', emoji: '☁️', name: '흐림' },
    { id: 'rain', emoji: '☔', name: '비' },
    { id: 'snow', emoji: '⛄', name: '눈' },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-12">
      <h2 className="text-4xl md:text-5xl font-bold text-gray-800 text-center break-keep">🌤️ 오늘 날씨는 어떤가요?</h2>
      <div className="flex flex-wrap justify-center gap-6">
        {weathers.map(w => (
          <button
            key={w.id}
            onClick={() => setWeather(w.id)}
            className={`flex flex-col items-center p-8 rounded-3xl border-4 transition-all duration-300 transform hover:scale-105 ${weather === w.id ? 'bg-white border-pastel-blue shadow-2xl scale-110' : 'bg-gray-50 border-transparent opacity-60 hover:opacity-100'}`}
          >
            <span className="text-7xl md:text-9xl mb-4">{w.emoji}</span>
            <span className="text-2xl font-bold text-gray-800">{w.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// 4. 오늘의 급식 알아보기 (고정된 레이아웃 + 자연스러운 이미지)
function Activity4({ menus }) {
  if (!menus) return <div className="flex items-center justify-center h-full"><p className="text-3xl font-bold">선생님이 메뉴를 등록하지 않았어요!</p></div>

  // 메뉴 유무 확인
  const hasRice = menus.rice && menus.rice.name
  const hasSoup = menus.soup && menus.soup.name
  const hasSide1 = menus.side1 && menus.side1.name
  const hasSide2 = menus.side2 && menus.side2.name
  const hasSide3 = menus.side3 && menus.side3.name

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-8">
      <h2 className="text-4xl md:text-5xl font-bold text-gray-800">🍱 오늘의 메뉴를 알아볼까요?</h2>
      
      {/* 식판 배경과 메뉴들 (크게 확장) */}
      <div className="relative w-full max-w-5xl aspect-[1.4] md:aspect-[1.6]">
        {/* 식판 일러스트 */}
        <img src="./utensils.jpg" alt="식판" className="w-full h-full object-contain drop-shadow-2xl mix-blend-multiply opacity-90" />
        
        {/* 반찬 1, 2, 3 영역 (상단) */}
        <div className="absolute top-[8%] left-[10%] w-[80%] h-[30%] flex justify-between gap-4">
          {hasSide1 && <MenuDisplay item={menus.side1} />}
          {hasSide2 && <MenuDisplay item={menus.side2} />}
          {hasSide3 && <MenuDisplay item={menus.side3} />}
        </div>
        
        {/* 밥, 국 영역 (하단) */}
        <div className="absolute bottom-[10%] left-[12%] w-[76%] h-[42%] flex justify-between gap-8">
          {hasRice && <MenuDisplay item={menus.rice} isLarge />}
          {hasSoup && <MenuDisplay item={menus.soup} isLarge />}
        </div>
      </div>
    </div>
  )
}

function MenuDisplay({ item, isLarge = false }) {
  if (!item.name && !item.imageUrl) return <div className="flex-1 opacity-0"></div>;
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden group">
      {/* 둥근 네모 형태의 사진 영역 (Hover시 살짝 커짐) */}
      <div className={`w-full aspect-[1.1] md:aspect-[1.2] rounded-[2rem] md:rounded-[3rem] overflow-hidden border-4 border-white/50 shadow-inner flex items-center justify-center relative bg-white/20 transition-transform duration-300 group-hover:scale-105 ${isLarge ? 'max-w-[80%]' : 'max-w-[90%]'}`}>
         {item.imageUrl ? (
           <img src={item.imageUrl} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
         ) : (
           <span className="text-4xl opacity-30">🍽️</span>
         )}
      </div>
      
      {/* 메뉴 이름표 (둥글고 귀엽게) */}
      <div className="absolute -bottom-2 bg-pastel-yellow/90 backdrop-blur-sm px-4 py-2 md:px-6 md:py-3 rounded-full border-2 border-white shadow-md text-center transform group-hover:-translate-y-2 transition-transform duration-300 min-w-[70%] max-w-[95%]">
        <span className="font-black text-gray-800 text-lg md:text-2xl drop-shadow-sm whitespace-nowrap overflow-hidden text-ellipsis block">
          {item.name}
        </span>
      </div>
    </div>
  )
}

// 5. 식판 채우기 (드래그 앤 드롭)
function Activity5({ menus }) {
  if (!menus) return <div className="flex items-center justify-center h-full"><p className="text-3xl font-bold">메뉴가 없습니다.</p></div>

  const initialItems = Object.entries(menus)
    .filter(([_, m]) => m && m.name)
    .map(([id, m]) => ({ id, ...m }))
  
  const [trayItems, setTrayItems] = useState([])
  const [sourceItems, setSourceItems] = useState(initialItems)

  const onDragEnd = (result) => {
    if (!result.destination) return
    const { source, destination } = result

    if (source.droppableId === destination.droppableId) return

    if (source.droppableId === 'source' && destination.droppableId === 'tray') {
      const item = sourceItems[source.index]
      setSourceItems(prev => prev.filter((_, i) => i !== source.index))
      setTrayItems(prev => [...prev, item])
    }
    else if (source.droppableId === 'tray' && destination.droppableId === 'source') {
      const item = trayItems[source.index]
      setTrayItems(prev => prev.filter((_, i) => i !== source.index))
      setSourceItems(prev => [...prev, item])
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6 text-center break-keep">🍽️ 식판에 반찬을 옮겨 담아봐요!</h2>
      
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-col md:flex-row gap-8 w-full max-w-6xl">
          
          {/* 메뉴 목록 (세로 스크롤 가능) */}
          <div className="md:w-1/3 bg-gray-100 rounded-3xl p-6 border-4 border-gray-200 min-h-[200px] md:h-[60vh] flex flex-col">
            <h3 className="text-2xl font-bold text-center mb-4 text-gray-600 bg-white py-2 rounded-2xl shadow-sm">반찬통</h3>
            <Droppable droppableId="source" direction="vertical">
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className={`flex-1 overflow-y-auto pr-2 flex flex-col gap-4 no-scrollbar transition-colors ${snapshot.isDraggingOver ? 'bg-gray-200/50 rounded-2xl' : ''}`}
                >
                  {sourceItems.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`bg-white rounded-2xl p-3 shadow-md flex items-center gap-4 border-2 border-transparent transition-transform ${snapshot.isDragging ? 'shadow-2xl scale-105 border-pastel-blue rotate-2 z-50' : 'hover:border-pastel-blue hover:scale-105'}`}
                        >
                          <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-gray-50 border-2 border-gray-100 shrink-0">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-3xl">🍲</div>
                            )}
                          </div>
                          <span className="font-bold text-xl md:text-2xl text-gray-800 break-keep">{item.name}</span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {sourceItems.length === 0 && (
                    <div className="h-full flex items-center justify-center text-gray-400 font-bold text-lg">
                      모두 담았습니다! ✨
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>

          {/* 식판 영역 */}
          <div className="md:w-2/3 bg-white rounded-3xl p-6 shadow-lg border-4 border-pastel-blue relative flex flex-col">
             <h3 className="text-2xl font-bold text-center mb-4 text-gray-600 bg-gray-50 py-2 rounded-2xl">내 식판</h3>
             
             {/* 배경 식판 가이드 이미지 (희미하게) */}
             <div className="absolute inset-0 z-0 flex items-center justify-center p-12 pointer-events-none">
               <img src="./utensils_flat.jpg" className="w-full h-full object-contain opacity-20 grayscale" />
             </div>

             <Droppable droppableId="tray" direction="horizontal">
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className={`flex-1 flex flex-wrap content-start gap-4 p-4 z-10 transition-colors rounded-2xl ${snapshot.isDraggingOver ? 'bg-pastel-blue/10 border-2 border-dashed border-pastel-blue' : ''}`}
                >
                  {trayItems.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`w-32 h-32 md:w-40 md:h-40 bg-white rounded-full shadow-lg overflow-hidden relative group border-4 ${snapshot.isDragging ? 'scale-110 shadow-2xl border-pastel-pink z-50' : 'border-white hover:border-pastel-pink hover:scale-105 transition-all'}`}
                        >
                          {item.imageUrl && <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover" />}
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-center py-2 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.name}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {trayItems.length === 0 && !snapshot.isDraggingOver && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-bold text-2xl z-0">
                      여기로 드래그 해주세요! 👇
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>

        </div>
      </DragDropContext>
    </div>
  )
}

// 6. 활동지 프린트
function Activity6({ menus }) {
  if (!menus) return null;
  const menuItems = Object.values(menus).filter(m => m && m.name)

  return (
    <div className="flex flex-col items-center h-full space-y-6">
      <div className="flex justify-between items-center w-full max-w-4xl no-print">
        <h2 className="text-4xl font-bold text-gray-800">📝 따라 쓰기 활동지</h2>
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
              {/* 사진 영역 */}
              <div className="w-[25mm] h-[25mm] relative bg-gray-100 rounded-[2mm] overflow-hidden print:border print:border-gray-300 shrink-0">
                 {item.imageUrl && <img src={item.imageUrl} className="absolute inset-0 w-full h-full object-cover" />}
              </div>
              
              {/* 따라쓰기 영역 */}
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
