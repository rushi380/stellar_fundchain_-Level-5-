import './styles/main.css';
import { initApp } from './components/App.js';

const app = document.getElementById('app');
if (!app) throw new Error('#app element not found in index.html');
initApp(app);