import {  Route, Routes } from "react-router-dom";

import "./App.css";

import PageHome from "./pages/Home";
import PagePlay from "./pages/Play"; 
import PageCompose from "./pages/Compose";

export default function App(){
    return <Routes>

        {/* Home Page */}
        <Route path="/" element={<PageHome />} />
        {/* Play Page */}
        <Route path="/play" element={<PagePlay />} />
        {/* Compose Page */}
        <Route path="/compose" element={<PageCompose />} />
    </Routes>
   
}