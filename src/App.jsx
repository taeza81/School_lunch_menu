import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentActivity from './pages/StudentActivity'

function Home() {
  return (
    <div className="min-h-screen bg-pastel-yellow flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl md:text-6xl font-bold text-gray-800 mb-12 text-center break-keep">
        오늘의 급식 메뉴 알아보기
      </h1>
      
      <div className="flex flex-col md:flex-row gap-8">
        <Link 
          to="/teacher"
          className="bg-pastel-blue hover:bg-blue-300 transition-colors rounded-3xl p-8 flex flex-col items-center shadow-lg transform hover:scale-105 min-w-[280px]"
        >
          <div className="w-40 h-40 md:w-56 md:h-56 mb-6 rounded-[2.5rem] overflow-hidden shadow-md border-4 border-white bg-white">
            <img src="/teacher_icon.jpg" alt="선생님 메뉴" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800">선생님 메뉴</h2>
        </Link>
        
        <Link 
          to="/student"
          className="bg-pastel-pink hover:bg-pink-300 transition-colors rounded-3xl p-8 flex flex-col items-center shadow-lg transform hover:scale-105 min-w-[280px]"
        >
          <div className="w-40 h-40 md:w-56 md:h-56 mb-6 rounded-[2.5rem] overflow-hidden shadow-md border-4 border-white bg-white">
            <img src="/student_icon.jpg" alt="우리반 급식 보기" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800">우리반 급식 보기</h2>
        </Link>
      </div>

      <div className="mt-16 bg-white/40 px-6 py-3 rounded-full backdrop-blur-md border border-white/60 shadow-sm text-yellow-900 font-bold flex items-center justify-center gap-2 text-sm md:text-base hover:bg-white/60 transition-colors">
        <span className="text-lg">💻</span>
        <span>제작자: 김해은혜학교 교사 <b className="text-yellow-950">오태윤</b></span>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teacher/*" element={<TeacherDashboard />} />
        <Route path="/student/*" element={<StudentActivity />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
