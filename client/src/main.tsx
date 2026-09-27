import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// 不用 StrictMode：它在開發模式會把 effect 跑兩次，Discord 登入會跳兩次
createRoot(document.getElementById('root')!).render(<App />);
