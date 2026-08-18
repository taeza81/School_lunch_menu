import { HashRouter, Routes, Route, Link } from 'react-router-dom'
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
    </div>
  )
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teacher/*" element={<TeacherDashboard />} />
        <Route path="/student/*" element={<StudentActivity />} />
      </Routes>
    </HashRouter>
  )
}

export default App
