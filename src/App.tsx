import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import NewPost from './pages/NewPost'
import SlideEditor from './pages/SlideEditor'
import ImageGen from './pages/ImageGen'
import Preview from './pages/Preview'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/new-post" element={<NewPost />} />
        <Route path="/slide-editor" element={<SlideEditor />} />
        <Route path="/image-gen" element={<ImageGen />} />
        <Route path="/preview" element={<Preview />} />
      </Routes>
    </BrowserRouter>
  )
}
